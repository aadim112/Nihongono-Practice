from youtube_transcript_api import YouTubeTranscriptApi
from janome.tokenizer import Tokenizer
import json
import traceback

def test():
    video_id = "sY7L5cfCWno"
    try:
        print(f"Fetching transcripts for {video_id}...")
        ytt_api = YouTubeTranscriptApi()
        transcript_list = ytt_api.list(video_id)
        
        print("Finding Japanese transcript...")
        ja_transcript = transcript_list.find_transcript(['ja'])
        ja_data = ja_transcript.fetch()
        print(f"Found {len(ja_data)} entries.")

        print("Initializing Tokenizer...")
        tokenizer = Tokenizer()
        
        print("Tokenizing first 5 entries...")
        for i, entry in enumerate(ja_data[:5]):
            tokens = []
            for token in tokenizer.tokenize(entry.text):
                tokens.append({
                    "surface": token.surface,
                    "base": token.base_form,
                    "reading": token.reading,
                    "pos": token.part_of_speech.split(',')[0]
                })
            print(f"Entry {i}: {len(tokens)} tokens.")
            
        print("Success!")
    except Exception as e:
        traceback.print_exc()

if __name__ == "__main__":
    test()
