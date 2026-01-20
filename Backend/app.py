from flask import Flask, request, jsonify
import flask
from flask_cors import CORS
import google.generativeai as genai
import json
import requests

app = flask.Flask(__name__)
CORS(app)
genai.configure(api_key="AIzaSyARhfqQenL1X4ywd0CfZR0AO4UGKopvcLU")
model = genai.GenerativeModel("gemini-flash-latest")

# Add your ElevenLabs API key here
ELEVENLABS_API_KEY = "60a6c7400ce05eedffd80ccfe5ae7c0efc80cb3141313440b955cfd2c90990a2"
ELEVENLABS_VOICE_ID = "B2hIadtwF0bAORTkJkOs"  

@app.route("/")
def index():
    return "Japanese Reading Passage Generator API"

@app.route("/api/analyze-vocab", methods=["POST"])
def analyze_vocab():
    data = request.json
    word = data.get("word", "")

    prompt = f"""
You are a Japanese dictionary.

Given this Japanese word:
{word}

Return ONLY valid JSON. No markdown.

{{
  "meaning": "simple English meaning",
  "kanji": "kanji if exists, otherwise same as input"
}}

Rules:
- N5 level meaning
- If word has no kanji, return hiragana as kanji
"""

    try:
        response = model.generate_content(prompt)
        return jsonify(json.loads(response.text))
    except Exception as e:
        print("VOCAB ERROR:", e)
        return jsonify({"error": str(e)}), 500


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

    grammar_text = "\n".join(
        f"- {g['pattern']} ({g['meaning']})" for g in grammar
    )
    vocab_text = ", ".join(normalized_vocab[:25])

    prompt = f"""
        You are a Japanese language teacher.

        Create a JLPT N5 level Japanese reading passage.

        Rules:
        - Use only hiragana
        - 20 to 25 short sentences
        - Simple natural Japanese
        - Make it based on simple story
        - Use ONLY the following grammar patterns:
        {grammar_text}

        - Prefer using these vocabulary words:
        {vocab_text}

        - No romaji
        - No English explanation
    """

    try:
        response = model.generate_content(prompt)
        return jsonify({
            "text": response.text.strip()
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

    prompt = f"""
You are a Japanese language teacher creating a listening comprehension exercise.

Create a conversation with EXACTLY {num_exchanges} exchanges for JLPT N5 level students.

CRITICAL REQUIREMENTS:
- You MUST use ONLY the grammar patterns provided below
- You MUST use ONLY the vocabulary words provided below
- Each Japanese sentence should be 8-15 words long (not too short!)
- Make it a coherent, natural conversation (like meeting someone, daily activities, etc.)
- Do not repeat sentences
- Keep conversation about day-to-day topics like shopping, school, hobbies, weather, family, etc.
- Use ONLY hiragana for Japanese text

Grammar patterns you MUST use (use at least 3-4 different patterns across the conversation):
{grammar_text}

Vocabulary words you MUST use (use as many as possible):
{vocab_text}

Return ONLY valid JSON in this exact format (no markdown, no backticks):

{{
  "exchanges": [
    {{
      "japanese": "longer Japanese sentence using provided vocab and grammar (8-15 words)",
      "english": "English translation",
      "options": ["correct English translation", "wrong option 1", "wrong option 2", "wrong option 3"],
      "correct_option_index": 0,
      "expected_response_english": "What the student should reply in English (8-12 words)",
      "expected_response_japanese": "What the student should reply in Japanese using provided vocab/grammar (8-15 words)"
    }}
  ]
}}

EXAMPLE FORMAT (DO NOT COPY, CREATE YOUR OWN):
If vocab includes: わたし, がっこう, いく, たべる, すき
And grammar includes: ～です, ～ます

Good Japanese sentence: "わたしはまいにちがっこうにいきます。あなたはどうですか。"
(I go to school every day. How about you?)

Bad (too short): "がっこうです。"

Rules:
- Create EXACTLY {num_exchanges} exchanges
- Use ONLY hiragana for Japanese
- Make sentences 8-15 words long (use multiple grammar patterns and vocab in each sentence)
- Create a natural, flowing conversation
- Shuffle options so correct answer isn't always first
- Make wrong options plausible but clearly incorrect
- Use particles correctly (は, が, を, に, で, etc.)
- Student responses should also be 8-15 words and use the provided vocab/grammar
"""

    try:
        response = model.generate_content(prompt)
        response_text = response.text.strip()
        
        # Remove markdown code blocks if present
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

@app.route("/api/generate-audio", methods=["POST"])
def generate_audio():
    """Generate audio using ElevenLabs API"""
    data = request.json
    text = data.get("text", "")

    if not text:
        return jsonify({"error": "No text provided"}), 400

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"
    
    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY
    }
    
    payload = {
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.5
        }
    }

    try:
        response = requests.post(url, json=payload, headers=headers)
        
        if response.status_code == 200:
            # Return audio as base64
            import base64
            audio_base64 = base64.b64encode(response.content).decode('utf-8')
            return jsonify({"audio": audio_base64})
        else:
            print("ELEVENLABS ERROR:", response.status_code, response.text)
            return jsonify({"error": "Audio generation failed"}), 500
            
    except Exception as e:
        print("AUDIO ERROR:", repr(e))
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

if __name__ == "__main__":
    app.run(debug=True)