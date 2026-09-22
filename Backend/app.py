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

# Load environment variables from .env file
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

if __name__ == "__main__":
    app.run(debug=True)
