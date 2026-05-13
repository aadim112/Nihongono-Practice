from flask import Flask, request, jsonify
import flask
from flask_cors import CORS
import google.generativeai as genai
import json
import random
import os
import re
import requests
import traceback
from xml.etree.ElementTree import ParseError
from dotenv import load_dotenv
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound, VideoUnavailable
import pykakasi


# Load environment variables from .env file
load_dotenv()

# Initialize pykakasi converter once at module level (expensive to re-create)
_kks = pykakasi.kakasi()

app = flask.Flask(__name__)
CORS(app)

# Get API key from environment variable
GOOGLE_API_KEY = os.getenv('GOOGLE_GENERATIVE_AI_API_KEY')
if not GOOGLE_API_KEY:
    raise ValueError("GOOGLE_GENERATIVE_AI_API_KEY not found in environment variables. Please check your .env file.")

genai.configure(api_key=GOOGLE_API_KEY)
model = genai.GenerativeModel("gemini-flash-latest")

def get_furigana_reading(text):
    """
    Use pykakasi to get the hiragana reading of a Japanese text string.
    Returns the hiragana reading, or the original text if it's already kana/latin.
    """
    result = _kks.convert(text)
    # Build reading from hiragana conversion
    reading = ''.join(item['hira'] for item in result)
    return reading


def is_kanji(ch):
    return '\u4e00' <= ch <= '\u9fff' or ch in '々〆〇'


def simple_tokenize(text):
    """
    Lightweight Japanese tokenizer using regex — no external dictionary needed.
    Splits text by character-type boundaries (kanji, hiragana, katakana, latin, punctuation).
    Attaches hiragana readings to kanji tokens using pykakasi for furigana rendering.
    """
    pattern = re.compile(
        r'[一-龯々〆〇]+'
        r'|[ぁ-ん]+'
        r'|[ァ-ヶ]+'
        r'|[a-zA-Z0-9]+'
        r'|[^\s]'
    )
    pos_map = {
        'kanji':    '名詞',
        'hiragana': '助詞',
        'katakana': '名詞',
        'latin':    '名詞',
        'other':    '記号',
    }
    tokens = []
    for m in pattern.finditer(text):
        surface = m.group()
        ch = surface[0]
        if is_kanji(ch):
            pos = pos_map['kanji']
            # Get furigana reading from pykakasi
            reading = get_furigana_reading(surface)
        elif '\u3041' <= ch <= '\u3096':
            pos = pos_map['hiragana']
            reading = surface  # already hiragana — no furigana needed
        elif '\u30a1' <= ch <= '\u30f6':
            pos = pos_map['katakana']
            reading = surface  # katakana — no furigana needed
        elif ch.isascii() and (ch.isalnum()):
            pos = pos_map['latin']
            reading = surface
        else:
            pos = pos_map['other']
            reading = surface
        tokens.append({
            'surface': surface,
            'base': surface,
            'reading': reading,
            'pos': pos,
        })
    return tokens

def extract_video_id(url):
    """
    Extracts the video ID from a YouTube URL.
    """
    patterns = [
        r"(?:v=|\/)([0-9A-Za-z_-]{11}).*",
        r"youtu\.be\/([0-9A-Za-z_-]{11})",
        r"embed\/([0-9A-Za-z_-]{11})"
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

@app.route("/api/youtube-transcript", methods=["GET"])
def get_youtube_transcript():
    video_url = request.args.get("url")
    if not video_url:
        return jsonify({"error": "No URL provided"}), 400
    
    video_id = extract_video_id(video_url)
    if not video_id:
        return jsonify({"error": "Invalid YouTube URL"}), 400

    try:
        ytt_api = YouTubeTranscriptApi()
        transcript_list = ytt_api.list(video_id)
        
        # Try to find Japanese transcript (manual first, then auto)
        try:
            ja_transcript = transcript_list.find_transcript(['ja'])
        except:
            # If no Japanese, we can't really do the task as requested
            return jsonify({"error": "No Japanese transcript available for this video"}), 404
        
        ja_data = ja_transcript.fetch()
        
        # Try to find English transcript for translation
        en_data = []
        try:
            en_transcript = transcript_list.find_transcript(['en'])
            en_data = en_transcript.fetch()
        except:
            # If no manual English, check if we can translate the Japanese one
            try:
                en_data = ja_transcript.translate('en').fetch()
            except:
                pass

        # Combine and tokenize
        processed_transcript = []
        has_translations = len(en_data) > 0

        for i, entry in enumerate(ja_data):
            # Tokenize Japanese text
            tokens = simple_tokenize(entry.text)

            # Find matching English translation — wider 10-second window
            translation = ""
            if has_translations:
                start = entry.start
                best_match = None
                min_diff = float('inf')
                for en_entry in en_data:
                    diff = abs(en_entry.start - start)
                    if diff < min_diff:
                        min_diff = diff
                        best_match = en_entry

                if best_match and min_diff < 10:  # widened to 10-second window
                    translation = best_match.text

            processed_transcript.append({
                "start": entry.start,
                "duration": entry.duration,
                "text": entry.text,
                "tokens": tokens,
                "translation": translation
            })

        # --- Gemini fallback translation ---
        # If no English track was found at all, translate all lines in one batch call.
        if not has_translations:
            try:
                japanese_lines = [entry["text"] for entry in processed_transcript]
                lines_json = json.dumps(japanese_lines, ensure_ascii=False)
                translation_prompt = f"""
Translate each of the following Japanese sentences into natural English.
Return ONLY a JSON array of strings (same order, same count). No markdown, no extra keys.

Japanese lines:
{lines_json}
"""
                trans_response = model.generate_content(translation_prompt)
                trans_text = trans_response.text.strip()
                # Strip possible markdown fences
                if trans_text.startswith("```"):
                    parts = trans_text.split("```")
                    trans_text = parts[1].strip()
                    if trans_text.startswith("json"):
                        trans_text = trans_text[4:].strip()
                translations = json.loads(trans_text)
                if isinstance(translations, list) and len(translations) == len(processed_transcript):
                    for i, t in enumerate(translations):
                        processed_transcript[i]["translation"] = t
            except Exception as te:
                print("GEMINI TRANSLATION FALLBACK ERROR:", te)
                # Non-fatal — transcript still works, just no translations

        return jsonify({
            "video_id": video_id,
            "transcript": processed_transcript
        })

    except TranscriptsDisabled:
        return jsonify({"error": "Transcripts are disabled for this video."}), 404
    except NoTranscriptFound:
        return jsonify({"error": "No Japanese transcript was found for this video."}), 404
    except VideoUnavailable:
        return jsonify({"error": "This video is unavailable, private, or age-restricted. Please try another one."}), 404
    except ParseError:
        return jsonify({"error": "Could not retrieve transcripts for this video (no subtitle data found)."}), 404
    except Exception as e:
        print("TRANSCRIPT ERROR:")
        traceback.print_exc()
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500

@app.route("/api/jisho-proxy", methods=["GET"])
def jisho_proxy():
    keyword = request.args.get("keyword")
    if not keyword:
        return jsonify({"error": "No keyword provided"}), 400
    
    try:
        url = f"https://jisho.org/api/v1/search/words?keyword={keyword}"
        response = requests.get(url)
        return jsonify(response.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/")
def index():
    return "Japanese Reading Passage Generator API"


@app.route("/api/grade-reading", methods=["POST"])
def grade_reading():
    data = request.json
    passage = data.get("passage", "")
    answers = data.get("answers", [])
    sentences = [s.strip() for s in passage.split("。") if s.strip()]

    prompt = f"""
        Return ONLY valid JSON. No markdown.

        {{
        "score": number,
        "results": [
            {{
            "japanese": string,
            "correct_english": string,
            "student_answer": string,
            "correct": boolean
            }}
        ]
        }}

        Japanese sentences:
        {sentences}

        Student answers:
        {answers}
    """

    try:
        response = model.generate_content(prompt)
        return jsonify(json.loads(response.text))
    except Exception as e:
        print("GRADE ERROR:", e)
        return jsonify({"error": str(e)}), 500

@app.route("/api/generate-reading", methods=["POST"])
def generate_reading():
    data = request.json
    grammar = data.get("grammar", [])
    raw_vocab = data.get("vocab", {})
    normalized_vocab = []

    # Normalize vocab into a simple list of word strings
    if isinstance(raw_vocab, dict) and "words" in raw_vocab:
        for v in raw_vocab["words"]:
            if isinstance(v, dict) and "word" in v:
                normalized_vocab.append(v["word"])
    elif isinstance(raw_vocab, list):
        for v in raw_vocab:
            if isinstance(v, str):
                normalized_vocab.append(v)
            elif isinstance(v, dict) and "word" in v:
                normalized_vocab.append(v["word"])

    if not grammar:
        grammar = [{"pattern": "〜です", "meaning": "to be"}]

    # Safety cap: even if the client sends more, limit what goes into the prompt.
    # The frontend already samples before sending; this is a defensive backstop.
    grammar = grammar[:8]
    normalized_vocab = normalized_vocab[:25]

    print(f"[generate-reading] grammar patterns: {len(grammar)}, vocab words: {len(normalized_vocab)}")

    grammar_text = "\n".join(
        f"- {g['pattern']} ({g['meaning']})" for g in grammar
    )
    vocab_text = ", ".join(normalized_vocab)

    # We now ask the model to return a passage PLUS 10–15 comprehension questions.
    # The model must return ONLY JSON so the frontend can parse it safely.
    prompt = f"""
You are a Japanese language teacher.

Create a JLPT N5 level Japanese reading passage AND comprehension questions.

CRITICAL OUTPUT FORMAT (return ONLY valid JSON, no markdown, no backticks):
{{
  "passage": "Japanese passage text. Use JLPT N5 level kanji where appropriate, otherwise use hiragana. 20–25 short sentences.",
  "questions": [
    {{
      "id": 1,
      "question_japanese": "Comprehension question in simple hiragana Japanese based ONLY on the passage.",
      "question_english": "Same question in simple English.",
      "expected_answer_english": "Short ideal answer in English.",
      "expected_answer_japanese": "Short ideal answer in hiragana Japanese."
    }}
  ]
}}

REQUIREMENTS:
- Passage:
  - JLPT N5 level
  - You MAY use kanji, but ONLY JLPT N5 level kanji. If a word uses kanji above N5 level, write it in hiragana.
  - 20–25 short sentences
  - Simple, natural Japanese
  - A coherent simple story
  - Use ONLY the following grammar patterns as much as possible:
{grammar_text}
  - Prefer using these vocabulary words (but only if they fit naturally):
{vocab_text}

- Questions:
  - Create BETWEEN 10 and 15 questions (inclusive)
  - Every question MUST be answerable using ONLY information from the passage
  - Strictly Use N5 kanji words if using them otherwise use hiragana
  - Mix of:
    - who/what/when/where/why/how questions
    - yes/no questions
  - Provide each question in BOTH Japanese (hiragana only) and English
  - Provide BOTH an ideal English answer and an ideal Japanese answer (hiragana only)
  - Keep answers short (1–2 short sentences)
"""

    try:
        response = model.generate_content(prompt)
        response_text = response.text.strip()

        # Sometimes models wrap JSON in ``` fences – strip them if present.
        if response_text.startswith("```"):
            parts = response_text.split("```")
            # Take the first non-empty chunk after the first fence
            if len(parts) > 1:
                candidate = parts[1].strip()
                if candidate.startswith("json"):
                    candidate = candidate[4:].strip()
                response_text = candidate

        reading_payload = json.loads(response_text)

        # Basic defensive shaping: ensure required keys exist
        passage = reading_payload.get("passage", "").strip()
        questions = reading_payload.get("questions", [])

        if not isinstance(questions, list):
            questions = []

        passage_tokens = simple_tokenize(passage)

        return jsonify({
            "passage": passage,
            "passage_tokens": passage_tokens,
            "questions": questions
        })
    except Exception as e:
        print("GEMINI ERROR:", repr(e))
        return jsonify({"error": str(e)}), 500
    

@app.route("/api/start-conversation", methods=["POST"])
def start_conversation():
    """Generate a complete conversation with specified number of exchanges"""
    data = request.json
    grammar = data.get("grammar", [])
    vocab = data.get("vocab", [])
    num_exchanges = data.get("num_exchanges", 5)

    if not grammar:
        grammar = [{"pattern": "〜です", "meaning": "to be"}]

    grammar_text = "\n".join(f"- {g['pattern']} ({g['meaning']})" for g in grammar)
    normalized_vocab = []
    for v in vocab:
        if isinstance(v, str):
            normalized_vocab.append(v)
        elif isinstance(v, dict) and "word" in v:
            normalized_vocab.append(v["word"])

    vocab_text = ", ".join(normalized_vocab[:25])

    # Add randomness to ensure different conversations each time
    scenarios = [
        "a conversation at a train station asking for directions",
        "a conversation in a restaurant ordering food",
        "a conversation at school discussing homework and classes",
        "a conversation at a store shopping for clothes or groceries",
        "a conversation at home talking about daily plans",
        "a conversation meeting a new friend and introducing yourself",
        "a conversation about hobbies and weekend activities",
        "a conversation about weather and making plans",
        "a conversation at a library or bookstore",
        "a conversation about family and personal information",
        "a conversation about time and scheduling appointments",
        "a conversation about food preferences and cooking"
    ]
    
    random_scenario = random.choice(scenarios)
    random_context = random.choice([
        "Make it very detailed with longer sentences.",
        "Include more background information in each exchange.",
        "Add more context and explanation in the conversation.",
        "Make the dialogue more elaborate and descriptive."
    ])

    prompt = f"""
You are a Japanese language teacher creating a JLPT N5 listening comprehension exercise.

Create a COMPLETELY NEW and DIFFERENT conversation with EXACTLY {num_exchanges} exchanges.
IMPORTANT: This conversation must be UNIQUE and DIFFERENT from any previous conversation you've created.

SCENARIO: {random_scenario}
CONTEXT VARIATION: {random_context}

CRITICAL REQUIREMENTS FOR JLPT LISTENING PRACTICE:
- You MUST use ONLY the grammar patterns provided below
- You MUST use ONLY the vocabulary words provided below
- Each Japanese sentence should be 15-25 words long (LONGER sentences for realistic JLPT practice!)
- Make it a coherent, natural conversation with detailed exchanges
- Do not repeat sentences or ideas
- Use ONLY hiragana for Japanese text
- Create realistic JLPT-style listening questions with longer dialogues
- Each exchange should feel like a real conversation with context

Grammar patterns you MUST use (use at least 4-5 different patterns across the conversation):
{grammar_text}

Vocabulary words you MUST use (use as many as possible naturally):
{vocab_text}

Return ONLY valid JSON in this exact format (no markdown, no backticks):

{{
  "exchanges": [
    {{
      "japanese": "Longer Japanese sentence using provided vocab and grammar (15-25 words minimum, make it detailed!)",
      "english": "English translation",
      "options": ["Brief correct English translation (5-10 words max)", "Brief wrong option 1 (5-10 words max)", "Brief wrong option 2 (5-10 words max)", "Brief wrong option 3 (5-10 words max)"],
      "correct_option_index": 0,
      "expected_response_english": "What the student should reply in English (for reference only)",
      "expected_response_japanese": "What the student should reply in Japanese using provided vocab/grammar (10-20 words, natural response)"
    }}
  ]
}}

CRITICAL FORMATTING RULES:
- Options MUST be BRIEF (5-10 words maximum each) - short, clear phrases that are easy to understand
- Options should be simple English translations, not complex sentences
- Example good options: ["I want to go to the store", "I'm studying Japanese", "It's raining today", "I like this book"]
- Example bad options: ["Good evening. This is tea and water. Please give those, these, and a ticket to the student. Delicious!"]
- expected_response_japanese should be a natural, conversational Japanese response (10-20 words)
- The response should be appropriate for the conversation context

EXAMPLE FORMAT (DO NOT COPY, CREATE YOUR OWN):
If vocab includes: わたし, がっこう, いく, たべる, すき, ともだち, まいにち
And grammar includes: ～です, ～ます, ～たいです

Good LONG Japanese sentence: "わたしはまいにちがっこうにいきます。きょうはともだちとがっこうのしょくどうでひるごはんをたべたいです。あなたもいっしょにいきませんか。"
(I go to school every day. Today I want to eat lunch at the school cafeteria with my friend. Won't you come with us too?)

Bad (too short): "がっこうです。"

Rules:
- Create EXACTLY {num_exchanges} exchanges
- Use ONLY hiragana for Japanese
- Japanese audio sentences: 15-25 words long MINIMUM (use multiple grammar patterns and vocab)
- OPTIONS MUST BE BRIEF: Each option should be 5-10 words maximum - short, clear English phrases
- Options are English translations of the Japanese audio - keep them simple and understandable
- Create a natural, flowing conversation with DETAILED exchanges
- Shuffle options so correct answer isn't always first (randomize correct_option_index)
- Make wrong options plausible but clearly incorrect - they should be related but wrong
- Use particles correctly (は, が, を, に, で, etc.)
- Student Japanese responses: 10-20 words, natural conversational responses
- Make this conversation COMPLETELY DIFFERENT from any previous conversation
- Add variety: use different sentence structures, different topics within the scenario
- Each exchange: Japanese audio → user selects English translation → user types Japanese response
- Ensure expected_response_japanese is logical and appropriate for the conversation context
"""

    try:
        response = model.generate_content(prompt)
        response_text = response.text.strip()
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
            response_text = response_text.strip()
        
        conversation_data = json.loads(response_text)
        return jsonify(conversation_data)
    except Exception as e:
        print("CONVERSATION ERROR:", repr(e))
        print("Response:", response.text if 'response' in locals() else "No response")
        return jsonify({"error": str(e)}), 500

@app.route("/api/check-answer", methods=["POST"])
def check_answer():
    """Check if student's Japanese answer is correct"""
    data = request.json
    student_answer = data.get("student_answer", "")
    expected_japanese = data.get("expected_japanese", "")
    expected_english = data.get("expected_english", "")

    prompt = f"""
        You are checking a Japanese N5 student's answer.

        Expected meaning in English: {expected_english}
        Expected answer in Japanese: {expected_japanese}
        Student's answer in Japanese: {student_answer}

        Compare the student's answer to the expected answer.

        Be VERY LENIENT:
        - Accept if the core meaning matches
        - Accept different word order (は vs が, particle variations)
        - Accept minor hiragana typos (1-2 character mistakes)
        - Accept if they express the same idea using similar vocabulary
        - The student is a beginner, so don't be too strict

        Only mark as incorrect if:
        - The meaning is completely different
        - They used completely wrong vocabulary
        - The grammar makes it incomprehensible

        Return ONLY valid JSON (no markdown):

        {{
        "correct": true or false,
        "feedback": "brief encouraging feedback in English (if correct: 'Great job!' if incorrect: hint what was wrong)"
        }}
        """

    try:
        response = model.generate_content(prompt)
        response_text = response.text.strip()
        
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
            response_text = response_text.strip()
        
        result = json.loads(response_text)
        return jsonify(result)
    except Exception as e:
        print("CHECK ERROR:", repr(e))
        return jsonify({"error": str(e)}), 500


@app.route("/api/grade-reading-questions", methods=["POST"])
def grade_reading_questions():
    """
    Grade free-text answers to 10–15 comprehension questions about a passage.

    Expected JSON body:
    {
      "passage": "Japanese passage text",
      "questions": [
        {
          "id": 1,
          "question_english": "...",
          "expected_answer_english": "...",
          "expected_answer_japanese": "..."
        },
        ...
      ],
      "answers": ["student answer for q1", "student answer for q2", ...]
    }
    """
    data = request.json
    passage = data.get("passage", "")
    questions = data.get("questions", [])
    answers = data.get("answers", [])

    # Build a compact structure for the model
    qa_pairs = []
    for idx, q in enumerate(questions):
        qa_pairs.append({
            "id": q.get("id", idx + 1),
            "question_english": q.get("question_english", ""),
            "expected_answer_english": q.get("expected_answer_english", ""),
            "expected_answer_japanese": q.get("expected_answer_japanese", ""),
            "student_answer": answers[idx] if idx < len(answers) else ""
        })

    prompt = f"""
You are grading a Japanese reading comprehension exercise for a JLPT N5 student.

The passage (in Japanese) is:
{passage}

Here are the questions, ideal answers, and student answers:
{qa_pairs}

TASK:
- For EACH item in the list, decide if the student's answer shows a correct understanding of the passage.
- Be VERY LENIENT:
  - Accept paraphrasing and different wording
  - Accept minor grammar and spelling mistakes
  - Accept if the core meaning matches the expected answer
- Only mark incorrect if the meaning is clearly wrong or unrelated to the passage.

Return ONLY valid JSON in this exact format (no markdown, no backticks):
{{
  "score": number,   // percentage 0–100 of correctly answered questions (round to integer)
  "results": [
    {{
      "id": number,
      "question": string,              // English question
      "expected_answer": string,       // ideal English answer
      "student_answer": string,
      "correct": boolean,
      "feedback": string               // short, encouraging English feedback/hint
    }}
  ]
}}
"""

    try:
        response = model.generate_content(prompt)
        response_text = response.text.strip()

        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
            response_text = response_text.strip()

        graded = json.loads(response_text)
        return jsonify(graded)
    except Exception as e:
        print("GRADE QUESTIONS ERROR:", repr(e))
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    # Get configuration from environment variables
    # Render uses PORT environment variable, fallback to FLASK_PORT or 5000
    host = os.getenv('FLASK_HOST', '0.0.0.0')
    port = int(os.getenv('PORT', os.getenv('FLASK_PORT', 5000)))
    debug = os.getenv('FLASK_DEBUG', 'True').lower() == 'true'
    
    app.run(host=host, port=port, debug=debug)