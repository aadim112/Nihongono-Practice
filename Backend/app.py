from flask import Flask, request, jsonify
import flask
from flask_cors import CORS
import os
import requests
from dotenv import load_dotenv
import weaviate
from weaviate.classes.init import Auth
from weaviate.classes.query import MetadataQuery, Filter
import random
import traceback

load_dotenv()

app = flask.Flask(__name__) 
CORS(app)

# Initialize Weaviate client
WEAVIATE_URL = os.getenv("WEAVIATE_URL")
WEAVIATE_API_KEY = os.getenv("WEAVIATE_API_KEY")

headers = {"X-Cohere-Api-Key": os.getenv("COHERE_APIKEY")}

def get_weaviate_client():
    client = weaviate.connect_to_weaviate_cloud(
        cluster_url=WEAVIATE_URL,
        auth_credentials=Auth.api_key(WEAVIATE_API_KEY),
        headers=headers
    )

    return client

@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "status": "running",
        "message": "Server is Running",
    })

@app.route("/api/generate-vocab-question", methods=["POST"])
def generate_vocab_question():
    data = request.get_json()
    if not data or not data.get("meaning"):
        return jsonify({"error": "Missing 'meaning' in request body"}), 400
    correct_meaning = data["meaning"]
    word = data.get("word", "")
    kanji = data.get("kanji", "")
    mode = data.get("mode", "jp_to_en")
    try:
        client = get_weaviate_client()
        collection = client.collections.get("JapaneseVocab")

        result = collection.query.near_text(
            query=correct_meaning,
            limit=8,
            return_properties=["meaning", "word", "kanji"],
            return_metadata=MetadataQuery(distance=True)
        )
        client.close()
        
        distractors = []
        if mode == 'en_to_jp':
            correct_ans = f"{word} | {kanji}" if kanji else word
            for obj in result.objects:
                w = obj.properties.get("word", "")
                k = obj.properties.get("kanji", "")
                m = obj.properties.get("meaning", "")
                if m and m.lower() != correct_meaning.lower():
                    ans = f"{w} | {k}" if k else w
                    if ans and ans not in distractors and ans != correct_ans:
                        distractors.append(ans)
                if len(distractors) >= 3:
                    break
            while len(distractors) < 3:
                distractors.append("(no similar word found)")
            options = distractors[:3] + [correct_ans]
            random.shuffle(options)
            return jsonify({
                "word": word,
                "kanji": kanji,
                "meaning": correct_meaning,
                "correctAnswer": correct_ans,
                "options": options
            })
        else:
            correct_ans = correct_meaning
            for obj in result.objects:
                m = obj.properties.get("meaning", "")
                if m and m.lower() != correct_meaning.lower() and m not in distractors:
                    distractors.append(m)
                if len(distractors) >= 3:
                    break
            while len(distractors) < 3:
                distractors.append("(no similar word found)")
            options = distractors[:3] + [correct_ans]
            random.shuffle(options)
            return jsonify({
                "word": word,
                "kanji": kanji,
                "meaning": correct_meaning,
                "correctAnswer": correct_ans,
                "options": options
            })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/add-vocab", methods=["POST"])
def add_vocab():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON payload provided"}), 400
    words_list = data.get("words", [])
    if not isinstance(words_list, list) or len(words_list) == 0:
        return jsonify({"error": "No words provided in payload"}), 400

    added_count = 0
    updated_count = 0
    try:
        client = get_weaviate_client()
        collection = client.collections.get("JapaneseVocab")

        for w in words_list:
            word = w.get("word", "")
            kanji = w.get("kanji", "")
            meaning = w.get("meaning", "")
            level = w.get("level", "N5")
            confidence = int(w.get("confidence", 0))

            if not meaning:
                continue

            existing = collection.query.fetch_objects(
                filters=Filter.by_property("meaning").equal(meaning),
                limit=1
            )

            if existing.objects:
                for obj in existing.objects:
                    collection.data.update(
                        uuid=obj.uuid,
                        properties={
                            "word": word,
                            "kanji": kanji,
                            "meaning": meaning,
                            "level": level,
                            "confidence": confidence
                        }
                    )
                    updated_count += 1
            else:
                collection.data.insert(
                    properties={
                        "word": word,
                        "kanji": kanji,
                        "meaning": meaning,
                        "level": level,
                        "confidence": confidence
                    }
                )
                added_count += 1

        client.close()
        return jsonify({
            "status": "success",
            "added": added_count,
            "updated": updated_count
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/update-vocab-confidence", methods=["POST"])
def update_vocab_confidence():
    data = request.get_json()
    if not data or not data.get("meaning"):
        return jsonify({"error": "Missing 'meaning' or data in request"}), 400

    word = data.get("word", "")
    kanji = data.get("kanji", "")
    meaning = data.get("meaning", "")
    level = data.get("level", "N5")
    confidence = int(data.get("confidence", 0))

    try:
        client = get_weaviate_client()
        collection = client.collections.get("JapaneseVocab")

        objs = collection.query.fetch_objects(
            filters=Filter.by_property("meaning").equal(meaning),
            limit=5
        )
        if not objs.objects and word:
            objs = collection.query.fetch_objects(
                filters=Filter.by_property("word").equal(word),
                limit=5
            )

        if objs.objects:
            for obj in objs.objects:
                collection.data.update(
                    uuid=obj.uuid,
                    properties={
                        "confidence": confidence
                    }
                )
        else:
            collection.data.insert(
                properties={
                    "word": word,
                    "kanji": kanji,
                    "meaning": meaning,
                    "level": level,
                    "confidence": confidence
                }
            )

        client.close()
        return jsonify({
            "status": "success",
            "word": word,
            "meaning": meaning,
            "confidence": confidence
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

import json
import base64
import io

GEMINI_MODELS = [
    "gemini-flash-latest",
    "gemini-3.5-flash",
    "gemini-3.8-flash",
    "gemini-flash-lite-latest",
    "gemini-pro-latest"
]


def call_gemini(prompt, max_tokens=1200):
    api_key = os.getenv("GOOGLE_GENERATIVE_AI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return None
    for m_name in GEMINI_MODELS:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{m_name}:generateContent?key={api_key}"
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.75,
                    "maxOutputTokens": max_tokens,
                    "response_mime_type": "application/json"
                }
            }
            resp = requests.post(url, json=payload, timeout=30)
            if resp.status_code == 200:
                raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
                if raw.startswith("```"):
                    raw = raw.replace("```json", "").replace("```", "").strip()
                parsed = json.loads(raw)
                return parsed
        except Exception:
            pass
    return None

def fetch_tts_audio(text, api_key, rate=0.85):
    try:
        tts_url = f"https://texttospeech.googleapis.com/v1/text:synthesize?key={api_key}"
        tts_payload = {
            "input": {"ssml": text},
            "voice": {"languageCode": "ja-JP", "name": "ja-JP-Neural2-B"},
            "audioConfig": {"audioEncoding": "MP3", "speakingRate": rate, "pitch": -2.0}
        }
        r = requests.post(tts_url, json=tts_payload, timeout=12)
        if r.status_code == 200:
            return r.json().get("audioContent", "")
    except Exception:
        pass
    return ""

@app.route("/api/listening/update-grammar-confidence", methods=["POST"])
def update_grammar_confidence():
    data = request.get_json() or {}
    user_id = str(data.get("user_id", 0))
    grammar_ids = data.get("grammar_ids", [])  # list of grammar pattern IDs used
    delta = int(data.get("delta", 15))  # +delta for correct, -delta for wrong
    firebase_url = os.getenv("FIREBASE_DB_URL", "https://nihongoforbeg-default-rtdb.firebaseio.com")
    try:
        # Fetch current grammar confidence map  {grammar_id: score}
        resp = requests.get(f"{firebase_url}/{user_id}/grammar/grammarConfidence.json", timeout=5)
        conf_map = {}
        if resp.status_code == 200 and resp.json():
            conf_map = resp.json()

        for gid in grammar_ids:
            current = conf_map.get(gid, 0)
            conf_map[gid] = max(0, min(500, current + delta))

        # Write back
        put_resp = requests.put(
            f"{firebase_url}/{user_id}/grammar/grammarConfidence.json",
            json=conf_map,
            timeout=5
        )
        return jsonify({"status": "success", "updated": conf_map})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/listening/generate", methods=["POST"])
def generate_listening_exercise():
    data = request.get_json() or {}
    user_id = str(data.get("user_id", 0))
    level = data.get("level", "N5")  # N5, N4, N3

    firebase_url = os.getenv("FIREBASE_DB_URL", "https://nihongoforbeg-default-rtdb.firebaseio.com")
    api_key = os.getenv("GOOGLE_GENERATIVE_AI_API_KEY") or os.getenv("GOOGLE_API_KEY")

    # ── 1. Vocabulary from Weaviate ──────────────────────────────────────────
    words_list = []
    try:
        client = get_weaviate_client()
        collection = client.collections.get("JapaneseVocab")
        level_themes = {
            "N5": "daily life food home school weather greetings numbers",
            "N4": "work travel shopping schedules weather hobbies feelings",
            "N3": "news opinions abstract ideas social situations politics"
        }
        query = level_themes.get(level, level_themes["N5"])

        # Medium-confidence words (focus zone)
        try:
            med_f = Filter.by_property("confidence").greater_or_equal(80) & Filter.by_property("confidence").less_or_equal(320)
            med_r = collection.query.near_text(query=query, filters=med_f, limit=6,
                                               return_properties=["word", "kanji", "meaning", "confidence"])
            for obj in med_r.objects:
                words_list.append({k: obj.properties.get(k, "") for k in ["word", "kanji", "meaning", "confidence"]})
        except Exception:
            pass

        # Low-confidence words (struggling zone)
        if len(words_list) < 3:
            try:
                low_f = Filter.by_property("confidence").less_than(80)
                low_r = collection.query.near_text(query=query, filters=low_f, limit=3,
                                                   return_properties=["word", "kanji", "meaning", "confidence"])
                for obj in low_r.objects:
                    w = obj.properties.get("word", "")
                    if w and not any(x["word"] == w for x in words_list):
                        words_list.append({k: obj.properties.get(k, "") for k in ["word", "kanji", "meaning", "confidence"]})
            except Exception:
                pass

        # Plain fallback query
        if len(words_list) < 3:
            gen_r = collection.query.near_text(query=query, limit=8,
                                               return_properties=["word", "kanji", "meaning", "confidence"])
            for obj in gen_r.objects:
                w = obj.properties.get("word", "")
                if w and not any(x["word"] == w for x in words_list):
                    words_list.append({k: obj.properties.get(k, "") for k in ["word", "kanji", "meaning", "confidence"]})
                if len(words_list) >= 8:
                    break
        client.close()
    except Exception:
        traceback.print_exc()

    if not words_list:
        words_list = [
            {"word": "たべる", "kanji": "食べる", "meaning": "to eat", "confidence": 100},
            {"word": "のむ",   "kanji": "飲む",   "meaning": "to drink", "confidence": 120},
            {"word": "かう",   "kanji": "買う",   "meaning": "to buy", "confidence": 90},
            {"word": "がっこう","kanji": "学校",  "meaning": "school",  "confidence": 80},
            {"word": "ともだち","kanji": "友達",  "meaning": "friend",  "confidence": 150}
        ]
    words_list = words_list[:8]

    # ── 2. Grammar from Firebase (learned + unlearned with confidence) ────────
    learned_patterns  = []  # [{id, pattern, meaning, confidence}]
    unlearned_patterns = []

    grammar_json_path = os.path.join(os.path.dirname(__file__), "..", "src", "Components", "Grammar.json")
    all_static_grammar = []
    if os.path.exists(grammar_json_path):
        with open(grammar_json_path, "r", encoding="utf-8") as f:
            all_static_grammar = json.load(f)

    try:
        resp = requests.get(f"{firebase_url}/{user_id}/grammar.json", timeout=5)
        if resp.status_code == 200 and resp.json():
            g_data = resp.json()
            learned_ids  = set(g_data.get("GrammarLearned", []))
            conf_map     = g_data.get("grammarConfidence", {})
            custom_list  = g_data.get("customPatterns", [])

            for item in all_static_grammar:
                gid = item.get("id", "")
                entry = {
                    "id":       gid,
                    "pattern":  item.get("pattern", ""),
                    "meaning":  item.get("meaning", ""),
                    "level":    item.get("level", "N5"),
                    "confidence": conf_map.get(gid, 0)
                }
                if gid in learned_ids:
                    learned_patterns.append(entry)
                else:
                    unlearned_patterns.append(entry)

            for c in custom_list:
                gid = c.get("id", "")
                entry = {
                    "id":       gid,
                    "pattern":  c.get("pattern", ""),
                    "meaning":  c.get("meaning", ""),
                    "level":    c.get("level", "N5"),
                    "confidence": conf_map.get(gid, 0)
                }
                learned_patterns.append(entry)
    except Exception:
        pass

    # Filter by JLPT level
    def level_ok(e):
        lvl = e.get("level", "N5")
        lvl_order = {"N5": 0, "N4": 1, "N3": 2, "N2": 3, "N1": 4}
        target = lvl_order.get(level, 0)
        item_lvl = lvl_order.get(lvl, 0)
        return item_lvl <= target + 1

    learned_patterns  = [e for e in learned_patterns  if level_ok(e)]
    unlearned_patterns = [e for e in unlearned_patterns if level_ok(e)]

    # Pick 2-3 learned + 1-2 unlearned for the dialogue
    import random
    random.shuffle(learned_patterns)
    random.shuffle(unlearned_patterns)
    selected_learned   = learned_patterns[:3]
    selected_unlearned = unlearned_patterns[:2]
    all_selected_grammar = selected_learned + selected_unlearned

    # Fallback grammar if user has none
    if not all_selected_grammar:
        fallback = [
            {"id": "fb-1", "pattern": "〜たいです",         "meaning": "want to do",           "confidence": 0},
            {"id": "fb-2", "pattern": "〜てください",        "meaning": "please do",            "confidence": 0},
            {"id": "fb-3", "pattern": "〜なければなりません", "meaning": "must do",              "confidence": 0},
            {"id": "fb-4", "pattern": "〜てもいいです",      "meaning": "it is okay to do",     "confidence": 0},
            {"id": "fb-5", "pattern": "〜ませんか",          "meaning": "shall we / won't you", "confidence": 0},
        ]
        all_selected_grammar = fallback[:3]
        selected_unlearned   = fallback[3:]

    # ── 3. Build prompt ───────────────────────────────────────────────────────
    formatted_words   = "\n".join([f"- {w['word']} ({w.get('kanji','') or w['word']}): {w['meaning']}" for w in words_list])
    fmt_g_learned     = "\n".join([f"  • {g['pattern']} — {g['meaning']} [confidence: {g['confidence']}]" for g in selected_learned]) or "  (none yet)"
    fmt_g_unlearned   = "\n".join([f"  • {g['pattern']} — {g['meaning']}" for g in selected_unlearned]) or "  (none yet)"

    topic_map = {
        "N5": "everyday life — going somewhere together, shopping, schedules",
        "N4": "workplace or school — meetings, plans, problems to solve",
        "N3": "social situations — opinions, news events, advice-giving"
    }
    topic = topic_map.get(level, topic_map["N5"])

    prompt = f"""You are an expert Japanese language exam author writing a realistic {level} JLPT 聴解 (Listening Comprehension) practice question.

TOPIC AREA: {topic}

VOCABULARY to weave naturally into the conversation (use 4-6 of these):
{formatted_words}

GRAMMAR PATTERNS the student has ALREADY LEARNED (prioritise using these — they need reinforcement):
{fmt_g_learned}

GRAMMAR PATTERNS the student has NOT YET LEARNED (introduce 1 of these naturally so they encounter it):
{fmt_g_unlearned}

REQUIREMENTS:
- Write a NATURAL, flowing conversation of EXACTLY 8–10 turns alternating between 男の人 and 女の人.
- The speakers must sound like real people, not a textbook. Include filler words (あ、そうですか、えーと、ちょっと), hesitations, short reactions.
- The vocabulary and grammar must fit {level} level perfectly.
- Include at least ONE grammar pattern from the learned list AND one from the unlearned list.
- End with a clear question that tests comprehension (who, what, when, where, why, how).
- Write exactly 4 answer options — only ONE is correct; the others are plausible but wrong.
- Return ONLY a single valid JSON object. No markdown, no code fences.

JSON structure (follow EXACTLY):
{{
  "situation": "Situation sentence in Japanese",
  "question": "Question sentence in Japanese",
  "dialogue": [
    {{"speaker": "男の人", "japanese": "...", "reading": "...", "english": "..."}},
    {{"speaker": "女の人", "japanese": "...", "reading": "...", "english": "..."}}
  ],
  "options": ["Option A (English hint)", "Option B", "Option C", "Option D"],
  "correct_option": 0,
  "explanation": "1-2 sentences explaining the correct answer using evidence from the dialogue.",
  "grammar_ids_used": {json.dumps([g['id'] for g in all_selected_grammar])},
  "grammar_used": "pattern label string"
}}"""

    exercise = call_gemini(prompt, max_tokens=1500)

    # Fallback
    if not exercise or not exercise.get("dialogue") or len(exercise.get("dialogue", [])) < 4:
        exercise = {
            "situation": "男の人と女の人が話しています。",
            "question": "男の人はこれから何をしますか。",
            "dialogue": [
                {"speaker": "男の人", "japanese": "あ、田中さん。今日の午後、図書館で一緒に勉強しませんか。", "reading": "あ、たなかさん。きょうの ごご、としょかんで いっしょに べんきょうしませんか。", "english": "Oh, Tanaka-san. Would you like to study together at the library this afternoon?"},
                {"speaker": "女の人", "japanese": "あ、すみません。今日はちょっと難しいんですが…", "reading": "あ、すみません。きょうは ちょっと むずかしいんですが…", "english": "Ah, sorry. Today is a little difficult for me..."},
                {"speaker": "男の人", "japanese": "そうですか。どうしてですか。", "reading": "そうですか。どうして ですか。", "english": "I see. Why is that?"},
                {"speaker": "女の人", "japanese": "午後三時から病院の予約があるので、行かなければなりません。", "reading": "ごご さんじから びょういんの よやくが あるので、いかなければ なりません。", "english": "I have a hospital appointment from 3 PM, so I must go."},
                {"speaker": "男の人", "japanese": "大丈夫ですか。体の具合が悪いですか。", "reading": "だいじょうぶ ですか。からだの ぐあいが わるい ですか。", "english": "Are you okay? Are you feeling unwell?"},
                {"speaker": "女の人", "japanese": "ええ、昨日から少し頭が痛くて。明日なら大丈夫ですよ。", "reading": "ええ、きのうから すこし あたまが いたくて。あしたなら だいじょうぶ ですよ。", "english": "Yes, I've had a slight headache since yesterday. Tomorrow would be fine."},
                {"speaker": "男の人", "japanese": "わかりました。じゃ、明日の午後にしましょう。お大事に。", "reading": "わかりました。じゃ、あしたの ごごに しましょう。おだいじに。", "english": "Understood. Let's make it tomorrow afternoon then. Take care."},
                {"speaker": "女の人", "japanese": "ありがとうございます。また連絡しますね。", "reading": "ありがとう ございます。また れんらく しますね。", "english": "Thank you. I'll contact you again."}
            ],
            "options": [
                "病院へ行く (Go to the hospital)",
                "図書館で一人で勉強する (Study alone at the library)",
                "女の人と図書館へ行く (Go to the library with the woman)",
                "家に帰って寝る (Go home and sleep)"
            ],
            "correct_option": 1,
            "explanation": "The woman cannot go today due to a hospital appointment, so the man will study alone at the library today and they plan together for tomorrow.",
            "grammar_ids_used": [g["id"] for g in all_selected_grammar],
            "grammar_used": "〜なければなりません / 〜ませんか"
        }

    # ── 4. SSML Audio via Google Cloud TTS ───────────────────────────────────
    # Build SSML with breaks between speakers for clarity
    ssml_parts = ['<speak>']
    if exercise.get("situation"):
        ssml_parts.append(f'<s>{exercise["situation"]}</s><break time="1200ms"/>')
    for turn in exercise.get("dialogue", []):
        jp = turn.get("japanese", "")
        ssml_parts.append(f'<s>{jp}</s><break time="900ms"/>')
    if exercise.get("question"):
        ssml_parts.append(f'<break time="1500ms"/><s>質問。{exercise["question"]}</s>')
    ssml_parts.append('</speak>')
    ssml_text = "".join(ssml_parts)

    audio_b64 = fetch_tts_audio(ssml_text, api_key, rate=0.82) if api_key else ""

    return jsonify({
        "status":          "success",
        "audio":           audio_b64,
        "situation":       exercise.get("situation", ""),
        "question":        exercise.get("question", ""),
        "dialogue":        exercise.get("dialogue", []),
        "options":         exercise.get("options", []),
        "correct_option":  exercise.get("correct_option", 0),
        "explanation":     exercise.get("explanation", ""),
        "grammar_ids_used":exercise.get("grammar_ids_used", [g["id"] for g in all_selected_grammar]),
        "grammar_used":    exercise.get("grammar_used", ""),
    })


# ── Nihongo Naka Ni — daily English→Japanese translation passage ───────────
@app.route("/api/nihongo-naka-ni/generate", methods=["POST"])
def nihongo_naka_ni_generate():
    from datetime import datetime, timezone, timedelta
    import random as _rnd
    data         = request.get_json() or {}
    user_id      = str(data.get("user_id", 0))
    level        = data.get("level", "N5")
    force_regen  = bool(data.get("force", False))
    firebase_url = os.getenv("FIREBASE_DB_URL", "https://japanese-practice-bdcce-default-rtdb.firebaseio.com")
    api_key      = os.getenv("GOOGLE_GENERATIVE_AI_API_KEY") or os.getenv("GOOGLE_API_KEY")

    # IST date key — same day for the user regardless of UTC offset
    IST   = timezone(timedelta(hours=5, minutes=30))
    today = datetime.now(IST).strftime("%Y-%m-%d")

    # ── 1. Return cached passage for today if it is sufficiently long ─────
    if not force_regen:
        try:
            c_resp = requests.get(
                f"{firebase_url}/{user_id}/nihongoNakaNi/passages/{today}.json", timeout=5)
            if c_resp.status_code == 200 and c_resp.json():
                c_data = c_resp.json()
                # If cached passage has at least 130 words, return it directly
                if len(c_data.get("english", "").split()) >= 130:
                    return jsonify({"status": "success", "cached": True, **c_data})
        except Exception:
            pass

    # ── 2. Load learned grammar from Firebase + Grammar.json ─────────────
    grammar_json_path = os.path.join(
        os.path.dirname(__file__), "..", "src", "Components", "Grammar.json")
    all_static_grammar = []
    if os.path.exists(grammar_json_path):
        try:
            with open(grammar_json_path, "r", encoding="utf-8") as gf:
                all_static_grammar = json.load(gf)
        except Exception:
            pass

    learned_grammar = []
    try:
        gr = requests.get(f"{firebase_url}/{user_id}/grammar.json", timeout=5)
        if gr.status_code == 200 and gr.json():
            gd = gr.json()
            learned_ids = set(gd.get("GrammarLearned", []))
            for item in all_static_grammar:
                if item.get("id") in learned_ids:
                    learned_grammar.append({
                        "id": item.get("id"),
                        "pattern": item.get("pattern"),
                        "meaning": item.get("meaning"),
                        "level": item.get("level", "N5")
                    })
            for c in gd.get("customPatterns", []):
                learned_grammar.append({
                    "id": c.get("id", "custom"),
                    "pattern": c.get("pattern", ""),
                    "meaning": c.get("meaning", ""),
                    "level": level
                })
    except Exception as ge:
        print(f"Error fetching grammar from Firebase: {ge}")

    # Fallback to static grammar if user has no learned patterns yet
    if not learned_grammar:
        for item in all_static_grammar:
            if item.get("level", "N5") == level:
                learned_grammar.append({
                    "id": item.get("id"),
                    "pattern": item.get("pattern"),
                    "meaning": item.get("meaning"),
                    "level": item.get("level", "N5")
                })

    # ── 3. Load learned vocab from Firebase ───────────────────────────────
    learned_vocab = []
    try:
        # Check {user_id}/vocab/words.json first, then {user_id}/words.json
        vw_resp = requests.get(f"{firebase_url}/{user_id}/vocab/words.json", timeout=6)
        raw_words = vw_resp.json() if vw_resp.status_code == 200 else None
        if not raw_words:
            w_resp = requests.get(f"{firebase_url}/{user_id}/words.json", timeout=6)
            raw_words = w_resp.json() if w_resp.status_code == 200 else None

        if isinstance(raw_words, dict):
            raw_words = list(raw_words.values())
        if isinstance(raw_words, list):
            for w in raw_words:
                if isinstance(w, dict) and (w.get("word") or w.get("kanji")):
                    learned_vocab.append({
                        "word": w.get("word", ""),
                        "kanji": w.get("kanji") or w.get("word", ""),
                        "meaning": w.get("meaning", ""),
                        "level": w.get("level", "N5"),
                        "confidence": w.get("confidence", 0)
                    })
    except Exception as ve:
        print(f"Error fetching vocab from Firebase: {ve}")

    # Fallback to Weaviate if Firebase vocab was not found
    if not learned_vocab:
        try:
            wc = get_weaviate_client()
            col = wc.collections.get("JapaneseVocab")
            hf = Filter.by_property("confidence").greater_or_equal(100)
            hr = col.query.fetch_objects(filters=hf, limit=30, return_properties=["word", "kanji", "meaning"])
            for obj in hr.objects:
                m = obj.properties.get("meaning", "")
                k = obj.properties.get("kanji", "") or obj.properties.get("word", "")
                if m:
                    learned_vocab.append({"word": obj.properties.get("word", ""), "kanji": k, "meaning": m, "level": level})
            wc.close()
        except Exception:
            pass

    # ── 4. Sample grammar & vocab for the passage ─────────────────────────
    # Filter grammar by level if possible, else take all learned
    filtered_grammar = [g for g in learned_grammar if g.get("level", "N5") <= level] or learned_grammar
    _rnd.shuffle(filtered_grammar)
    sel_g = filtered_grammar[:8]

    # Filter vocab by level or confidence
    filtered_vocab = [v for v in learned_vocab if not v.get("level") or v.get("level") == level] or learned_vocab
    _rnd.shuffle(filtered_vocab)
    sel_v = filtered_vocab[:22]

    # Safety fallbacks
    if not sel_g:
        sel_g = [
            {"pattern": "〜たいです", "meaning": "want to do"},
            {"pattern": "〜てください", "meaning": "please do"},
            {"pattern": "〜なければなりません", "meaning": "must do"},
            {"pattern": "〜てもいいです", "meaning": "may / okay to do"},
            {"pattern": "〜から", "meaning": "because / since"},
            {"pattern": "〜ている", "meaning": "continuous action / state"},
        ]
    if not sel_v:
        sel_v = [
            {"kanji": "食べる", "word": "たべる", "meaning": "to eat"},
            {"kanji": "学校", "word": "がっこう", "meaning": "school"},
            {"kanji": "友達", "word": "ともだち", "meaning": "friend"},
            {"kanji": "明日", "word": "あした", "meaning": "tomorrow"},
            {"kanji": "勉強", "word": "べんきょう", "meaning": "study"},
            {"kanji": "本", "word": "ほん", "meaning": "book"},
            {"kanji": "図書館", "word": "としょかん", "meaning": "library"},
        ]

    # ── 5. Build prompt for a substantial 3-paragraph passage ─────────────
    g_str = "; ".join(f"{g['pattern']} ({g['meaning']})" for g in sel_g)
    v_str = ", ".join(f"{v['kanji'] or v['word']} ({v['meaning'][:35]})" for v in sel_v)

    prompt = f"""You are an expert Japanese language teacher creating a translation exercise for a JLPT {level} student.

AVAILABLE LEARNED GRAMMAR PATTERNS from student's profile:
{g_str}

AVAILABLE LEARNED VOCABULARY from student's profile:
{v_str}

TASK:
Write a LONG, substantial English reading and translation passage (between 180 and 240 words, divided into 3 detailed paragraphs separated by \\n\\n) for the student to translate into Japanese.

Structure the passage across 3 cohesive paragraphs:
- Paragraph 1: Morning routine, background context, and initial intentions or obligations.
- Paragraph 2: Midday events, activities, interactions with others, and key events.
- Paragraph 3: Evening conclusion, reflections, thoughts, questions, and plans for tomorrow.

Requirements:
1. The passage MUST naturally incorporate as many of the provided grammar patterns (at least 5-7) and vocabulary items (at least 12-18) as possible.
2. The English should be natural, coherent, and vivid.
3. Provide the complete, accurate Japanese translation matching the English paragraph by paragraph (separated by \\n\\n), strictly using the learned grammar patterns and vocabulary.
4. List the grammar patterns and vocabulary words that were utilized.

Return ONLY valid JSON (no markdown fences):
{{
  "english": "Paragraph 1...\\n\\nParagraph 2...\\n\\nParagraph 3...",
  "japanese": "段落1...\\n\\n段落2...\\n\\n段落3...",
  "grammar_used": ["pattern1", "pattern2", "pattern3"],
  "vocab_used": ["word1 (meaning)", "word2 (meaning)"]
}}"""

    result = None
    if api_key:
        try:
            result = call_gemini(prompt, max_tokens=2200)
        except Exception as ge:
            print(f"Gemini call error: {ge}")

    # Fallback passage if Gemini call failed
    if not result or not result.get("english"):
        result = {
            "english": (
                "Yesterday morning, I woke up early because I had an important test at school. "
                "I quickly prepared my bag, ate a delicious breakfast, and drank warm tea with my family. "
                "Before leaving the house, my mother told me that I must do my best, and she asked me to come home early.\n\n"
                "At midday, I met five of my friends in front of the school library. "
                "We were talking happily while eating lunch together under the warm sun. "
                "Since everyone wanted to study more for next week's exam, we borrowed some interesting books from our teacher and practiced difficult questions.\n\n"
                "In the evening, I walked back toward the train station with my classmate. "
                "The street was quiet, and there were many pleasant sounds coming from nearby shops. "
                "I was a little tired, but I felt very happy about what I accomplished today. "
                "Tomorrow is the weekend, so I think that resting at home will be wonderful."
            ),
            "japanese": (
                "昨日の朝、学校で大切なテストがあったので、早く起きました。"
                "すぐにカバンを準備して、美味しい朝ご飯を食べて、家族と一緒に温かいお茶を飲みました。"
                "家を出る前に、母は私に全力を尽くさなければならないと言って、早く帰ってくるように頼みました。\n\n"
                "昼頃、学校の図書館の前で友達五人に会いました。"
                "私たちは暖かい太陽の下で一緒に昼ご飯を食べながら、楽しそうに話していました。"
                "みんな来週の試験のためにもっと勉強したかったので、先生から面白い本を借りて、難しい問題を練習しました。\n\n"
                "夕方、クラスメートと一緒に駅に向かって歩いて帰りました。"
                "通りは静かで、近くの店からたくさんの心地よい音が聞こえてきました。"
                "少し疲れましたが、今日達成できたことについてとても嬉しく思いました。"
                "明日は週末なので、家で休むことは素晴らしいと思います。"
            ),
            "grammar_used": [g["pattern"] for g in sel_g[:6]],
            "vocab_used": [f"{v['kanji']} ({v['meaning'][:25]})" for v in sel_v[:8]],
        }

    # Attach metadata
    result.update({
        "date":          today,
        "level":         level,
        "grammar_hints": [{"pattern": g["pattern"], "meaning": g["meaning"]} for g in sel_g],
        "vocab_hints":   [{"kanji": v["kanji"], "word": v["word"], "meaning": v["meaning"]} for v in sel_v[:15]],
    })

    # ── 6. Cache in Firebase ──────────────────────────────────────────────
    try:
        requests.put(
            f"{firebase_url}/{user_id}/nihongoNakaNi/passages/{today}.json",
            json=result, timeout=6)
    except Exception as pe:
        print(f"Error caching passage to Firebase: {pe}")

    return jsonify({"status": "success", "cached": False, **result})


if __name__ == "__main__":
    app.run(debug=True)
