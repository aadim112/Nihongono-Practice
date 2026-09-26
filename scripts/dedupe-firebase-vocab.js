const DATABASE_URL = "https://japanese-practice-bdcce-default-rtdb.firebaseio.com";
const USER_IDS = [0, 1];

function toWordArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((w) => w && typeof w === "object");
  if (typeof raw === "object") {
    return Object.values(raw).filter((w) => w && typeof w === "object" && (w.word || w.meaning));
  }
  return [];
}

function confidenceOf(word) {
  const n = Number(word?.confidence);
  return Number.isFinite(n) ? n : 0;
}

function vocabKey(word) {
  return [
    String(word?.word || "").trim(),
    String(word?.kanji || "").trim(),
    String(word?.meaning || "").trim().toLowerCase(),
  ].join("|");
}

function mergeCopies(a, b) {
  const keep = confidenceOf(b) > confidenceOf(a) ? b : a;
  const other = keep === a ? b : a;
  return {
    ...other,
    ...keep,
    word: keep.word || other.word,
    kanji: keep.kanji || other.kanji,
    meaning: keep.meaning || other.meaning,
    level: keep.level || other.level,
    confidence: Math.max(confidenceOf(a), confidenceOf(b)),
  };
}

function collectWords(vocabNode) {
  if (!vocabNode || typeof vocabNode !== "object") return [];
  if (Array.isArray(vocabNode)) return vocabNode.filter(Boolean);

  const fromWords = toWordArray(vocabNode.words);
  if (fromWords.length > 0) return fromWords;

  const fromRoot = Object.entries(vocabNode)
    .filter(([key]) => /^\d+$/.test(key))
    .map(([, value]) => value)
    .filter((w) => w && typeof w === "object" && (w.word || w.meaning));
  return fromRoot;
}

function dedupeWords(words) {
  const byKey = new Map();
  let removed = 0;
  for (const word of words) {
    if (!word?.word) continue;
    const key = vocabKey(word);
    if (!byKey.has(key)) {
      byKey.set(key, word);
      continue;
    }
    byKey.set(key, mergeCopies(byKey.get(key), word));
    removed += 1;
  }
  return { unique: [...byKey.values()], removed };
}

async function main() {
  const apply = process.argv.includes("--apply");
  for (const userId of USER_IDS) {
    const res = await fetch(`${DATABASE_URL}/${userId}/vocab.json`);
    if (!res.ok) {
      console.log(`USER ${userId}: fetch failed ${res.status}`);
      continue;
    }
    const data = await res.json();
    const words = collectWords(data);
    const { unique, removed } = dedupeWords(words);
    const beforeAvg = words.length
      ? Math.round(words.reduce((sum, w) => sum + confidenceOf(w), 0) / words.length)
      : 0;
    const afterAvg = unique.length
      ? Math.round(unique.reduce((sum, w) => sum + confidenceOf(w), 0) / unique.length)
      : 0;
    console.log(
      `USER ${userId}: ${words.length} -> ${unique.length} (removed ${removed} duplicates), avg confidence ${beforeAvg}% -> ${afterAvg}%`
    );

    if (!apply) continue;
    if (removed === 0) {
      console.log(`USER ${userId}: no write needed`);
      continue;
    }

    const cleaned = {
      words: unique,
      totalCount: unique.length,
      revisionMaxScore: Number(data?.revisionMaxScore ?? 0),
    };
    const put = await fetch(`${DATABASE_URL}/${userId}/vocab.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cleaned),
    });
    console.log(`USER ${userId}: write ${put.status}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
