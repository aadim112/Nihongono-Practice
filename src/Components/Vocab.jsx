import './Vocab.css'
import { useState, useEffect, useMemo, useRef } from 'react';
import { ref, push, update, get, child, onValue, set, remove } from "firebase/database";
import db from './firebase'
import kanjiData from './Kanjis.json';
import jmdictData from '../data/jmdict.json';


const VocabSection = ({user, userName, users = []}) => {
    const [inputValue, setInputValue] = useState('');
    const [wordCount, setWordCount] = useState(0);
    const [romanjiBuffer, setRomanjiBuffer] = useState(''); 
    const [words, setWords] = useState([]);
    const [uploadedWord, setUploadedWords] = useState([]);
    const [toggle,setToggle] = useState(false);

    const [isRevisionMode, setIsRevisionMode] = useState(false);
    const [revisionQuestion, setRevisionQuestion] = useState(null);
    const [revisionLocked, setRevisionLocked] = useState(false);
    const [correctCount, setCorrectCount] = useState(0);
    const [wrongAnswers, setWrongAnswers] = useState([]); // { prompt, correctAnswer, chosenAnswer, mode, word, kanji, meaning }
    const [revisionMode, setRevisionMode] = useState('jp_to_en'); // 'jp_to_en' | 'en_to_jp'
    const revisionSessionRef = useRef({ sig: '', remainingIds: [], asked: new Set() });
    const extraRevisionSessionRef = useRef({ sig: '', remainingKeys: [], asked: new Set() });
    const [maxScoresByUser, setMaxScoresByUser] = useState({});
    const [extraRevisionMap, setExtraRevisionMap] = useState({}); // key -> saved question object
    const [isExtraRevise, setIsExtraRevise] = useState(false);
    
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    useEffect(() => {
        // Reset per-user revision session/UI state when switching users
        setRevisionQuestion(null);
        setRevisionLocked(false);
        setCorrectCount(0);
        setWrongAnswers([]);
        revisionSessionRef.current = { sig: '', remainingIds: [], asked: new Set() };
        extraRevisionSessionRef.current = { sig: '', remainingKeys: [], asked: new Set() };
        setIsExtraRevise(false);
        setExtraRevisionMap({});

        const vocabRef = ref(db, `${user}/vocab`);

        const unsubscribe = onValue(vocabRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                setUploadedWords(data.words ?? []);
                setWordCount(data.totalCount ?? 0);
                setMaxScoresByUser(prev => ({ ...prev, [user]: Number(data.revisionMaxScore ?? 0) }));
            } else {
                setUploadedWords([]);
                setWordCount(0);
                setMaxScoresByUser(prev => ({ ...prev, [user]: 0 }));
            }
        });

        return () => unsubscribe();
    }, [user]);

    useEffect(() => {
        const extraRef = ref(db, `${user}/ExtraRevision`);
        const unsub = onValue(extraRef, (snapshot) => {
            const data = snapshot.exists() ? snapshot.val() : {};
            setExtraRevisionMap(data && typeof data === 'object' ? data : {});
        });
        return () => unsub();
    }, [user]);

    useEffect(() => {
        if (!isRevisionMode) return;
        const currentMax = Number(maxScoresByUser?.[user] ?? 0);
        if (correctCount <= currentMax) return;

        const vocabRef = ref(db, `${user}/vocab`);
        setMaxScoresByUser(prev => ({ ...prev, [user]: correctCount }));
        update(vocabRef, { revisionMaxScore: correctCount }).catch((e) => {
            console.error("Failed to update revisionMaxScore:", e);
        });
    }, [correctCount, maxScoresByUser, isRevisionMode, user]);

    useEffect(() => {
        if (!Array.isArray(users) || users.length === 0) return;

        const unsubscribes = users.map(u => {
            const userId = u?.id;
            if (userId === undefined || userId === null) return null;

            const scoreRef = ref(db, `${userId}/vocab/revisionMaxScore`);
            return onValue(scoreRef, (snapshot) => {
                const val = snapshot.exists() ? Number(snapshot.val() ?? 0) : 0;
                setMaxScoresByUser(prev => ({ ...prev, [userId]: val }));
            });
        }).filter(Boolean);

        return () => {
            unsubscribes.forEach(fn => {
                try { fn(); } catch {}
            });
        };
    }, [users]);

    const getUserDisplayName = (userId) => {
        const fromList = Array.isArray(users) ? users.find(u => u?.id === userId)?.name : undefined;
        if (fromList) return fromList;
        if (userId === user) return (userName || String(userId));
        return String(userId);
    };

    const dictionaryLoaded = !!(jmdictData && jmdictData.words && Array.isArray(jmdictData.words));

    const shuffle = (arr) => {
        const copy = [...arr];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    };

    const validRevisionPool = useMemo(() => {
        const valid = (uploadedWord || []).filter(w => w && w.word && w.kanji && w.meaning);
        return valid.map((w) => ({
            id: `${String(w.word).trim()}|${String(w.kanji).trim()}|${String(w.meaning).trim()}`,
            word: String(w.word).trim(),
            kanji: String(w.kanji).trim(),
            meaning: String(w.meaning).trim(),
        }));
    }, [uploadedWord]);

    const buildRevisionQuestionForItem = (item, mode, pool) => {
        if (!item) return null;

        if (mode === 'en_to_jp') {
            const correct = `${item.word} | ${item.kanji}`;
            const distractorPool = (pool || [])
                .filter(p => p.id !== item.id)
                .map(p => `${p.word} | ${p.kanji}`);
            const distractors = shuffle(Array.from(new Set(distractorPool))).slice(0, 5);
            const options = shuffle([correct, ...distractors]);
            return {
                id: item.id,
                mode,
                word: item.word,
                kanji: item.kanji,
                meaning: item.meaning,
                prompt: item.meaning,
                options,
                correctAnswer: correct,
            };
        }

        const correct = item.meaning;
        const distractorPool = (pool || [])
            .filter(p => p.id !== item.id)
            .map(p => p.meaning);
        const distractors = shuffle(Array.from(new Set(distractorPool))).slice(0, 5);
        const options = shuffle([correct, ...distractors]);
        return {
            id: item.id,
            mode,
            word: item.word,
            kanji: item.kanji,
            meaning: item.meaning,
            prompt: `${item.word} (${item.kanji})`,
            options,
            correctAnswer: correct,
        };
    };

    const initRevisionSessionIfNeeded = () => {
        const sig = validRevisionPool.map(v => v.id).join('||');
        if (revisionSessionRef.current.sig === sig) return;

        revisionSessionRef.current.sig = sig;
        revisionSessionRef.current.asked = new Set();
        revisionSessionRef.current.remainingIds = shuffle(validRevisionPool.map(v => v.id));
    };

    const buildExtraKey = (baseId, mode) => `${baseId}::${mode}`;

    const starredKeysForMode = useMemo(() => {
        const keys = Object.keys(extraRevisionMap || {});
        return keys.filter(k => extraRevisionMap?.[k]?.mode === revisionMode);
    }, [extraRevisionMap, revisionMode]);

    const initExtraRevisionSessionIfNeeded = () => {
        const sig = starredKeysForMode.join('||');
        if (extraRevisionSessionRef.current.sig === sig) return;

        extraRevisionSessionRef.current.sig = sig;
        extraRevisionSessionRef.current.asked = new Set();
        extraRevisionSessionRef.current.remainingKeys = shuffle([...starredKeysForMode]);
    };

    const startNextRevisionQuestion = () => {
        if (isExtraRevise) {
            initExtraRevisionSessionIfNeeded();

            const asked = extraRevisionSessionRef.current.asked;
            const remaining = extraRevisionSessionRef.current.remainingKeys;

            while (remaining.length > 0 && asked.has(remaining[0])) {
                remaining.shift();
            }

            const nextKey = remaining.shift();
            if (!nextKey) {
                setRevisionQuestion(null);
                setRevisionLocked(false);
                return;
            }

            asked.add(nextKey);
            const saved = extraRevisionMap?.[nextKey];
            if (!saved) {
                setRevisionQuestion(null);
                setRevisionLocked(false);
                return;
            }

            setRevisionQuestion(saved);
            setRevisionLocked(false);
            return;
        }

        initRevisionSessionIfNeeded();

        const asked = revisionSessionRef.current.asked;
        const remaining = revisionSessionRef.current.remainingIds;

        while (remaining.length > 0 && asked.has(remaining[0])) {
            remaining.shift();
        }

        const nextId = remaining.shift();
        if (!nextId) {
            setRevisionQuestion(null);
            setRevisionLocked(false);
            return;
        }

        asked.add(nextId);
        const item = validRevisionPool.find(v => v.id === nextId);
        const next = buildRevisionQuestionForItem(item, revisionMode, validRevisionPool);
        setRevisionQuestion(next);
        setRevisionLocked(false);
    };

    const flipRevisionMode = () => {
        setRevisionMode(prev => (prev === 'jp_to_en' ? 'en_to_jp' : 'jp_to_en'));
        setRevisionLocked(false);
        setRevisionQuestion((current) => {
            if (!current) return current;
            const item = validRevisionPool.find(v => v.id === current.id);
            const nextMode = current.mode === 'jp_to_en' ? 'en_to_jp' : 'jp_to_en';
            return buildRevisionQuestionForItem(item, nextMode, validRevisionPool);
        });
    };

    useEffect(() => {
        if (!isRevisionMode) return;
        if (isExtraRevise) {
            initExtraRevisionSessionIfNeeded();
        } else {
            initRevisionSessionIfNeeded();
        }
        if (!revisionQuestion) {
            startNextRevisionQuestion();
        }
    }, [isRevisionMode, validRevisionPool, isExtraRevise, starredKeysForMode]);

    const isCurrentQuestionStarred = useMemo(() => {
        if (!revisionQuestion?.id || !revisionQuestion?.mode) return false;
        const key = buildExtraKey(revisionQuestion.id, revisionQuestion.mode);
        return !!extraRevisionMap?.[key];
    }, [revisionQuestion, extraRevisionMap]);

    const toggleStarCurrentQuestion = async () => {
        if (!revisionQuestion?.id || !revisionQuestion?.mode) return;
        const key = buildExtraKey(revisionQuestion.id, revisionQuestion.mode);
        const targetRef = ref(db, `${user}/ExtraRevision/${key}`);

        if (extraRevisionMap?.[key]) {
            await remove(targetRef);
            return;
        }

        const payload = {
            ...revisionQuestion,
            key,
            starredAt: Date.now(),
        };
        await set(targetRef, payload);
    };

    const toggleExtraRevise = () => {
        setIsExtraRevise(prev => !prev);
        setRevisionQuestion(null);
        setRevisionLocked(false);
        extraRevisionSessionRef.current = { sig: '', remainingKeys: [], asked: new Set() };
        revisionSessionRef.current = { sig: '', remainingIds: [], asked: new Set() };
    };

    const normalize = (str) => str.trim().normalize("NFKC");

    const searchIndex = useMemo(() => {
        if (!jmdictData) return new Map();
        
        const map = new Map();

        jmdictData.words.forEach(word => {
            word.kana?.forEach(k => {
                if (!map.has(k.text)) {
                    map.set(k.text, []);
                }
                map.get(k.text).push(word);
            });
            word.kanji?.forEach(k => {
                if (!map.has(k.text)) {
                    map.set(k.text, []);
                }
                map.get(k.text).push(word);
            });
        });

        return map;
    }, [jmdictData]);

    const searchInDictionary = (word) => {
        const normalized = normalize(word);
        const entries = searchIndex.get(normalized);
        
        if (!entries || entries.length === 0) return null;

        const allSuggestions = [];

        entries.forEach(entry => {
            const kanjiVariants = entry.kanji?.map(k => ({
                text: k.text,
                common: k.common
            })) || [];

            if (kanjiVariants.length === 0) {
                kanjiVariants.push({ text: word, common: true });
            }

            entry.sense.forEach((sense, senseIndex) => {
                const meanings = sense.gloss
                    .filter(g => g.lang === "eng")
                    .map(g => g.text)
                    .join("; ");

                const applicableKanji = sense.appliesToKanji || ["*"];
                
                kanjiVariants.forEach(kanjiVar => {
                    const applies = applicableKanji.includes("*") || 
                                   applicableKanji.includes(kanjiVar.text);
                    
                    if (applies && meanings) {
                        allSuggestions.push({
                            word: word,
                            kanji: kanjiVar.text,
                            meaning: meanings,
                            partOfSpeech: sense.partOfSpeech.join(", "),
                            common: kanjiVar.common,
                            entryId: entry.id,
                            senseIndex: senseIndex
                        });
                    }
                });
            });
        });

        const groupedByMeaning = {};
        
        allSuggestions.forEach(suggestion => {
            const key = `${suggestion.meaning}|${suggestion.partOfSpeech}`;
            
            if (!groupedByMeaning[key]) {
                groupedByMeaning[key] = {
                    word: suggestion.word,
                    meaning: suggestion.meaning,
                    partOfSpeech: suggestion.partOfSpeech,
                    kanjiVariants: [],
                    primaryKanji: null,
                    hasCommon: false
                };
            }
            
            groupedByMeaning[key].kanjiVariants.push({
                text: suggestion.kanji,
                common: suggestion.common
            });
            
            if (suggestion.common && !groupedByMeaning[key].hasCommon) {
                groupedByMeaning[key].primaryKanji = suggestion.kanji;
                groupedByMeaning[key].hasCommon = true;
            } else if (!groupedByMeaning[key].primaryKanji) {
                groupedByMeaning[key].primaryKanji = suggestion.kanji;
            }
        });

        const groupedSuggestions = Object.values(groupedByMeaning);

        groupedSuggestions.sort((a, b) => {
            if (a.hasCommon !== b.hasCommon) return b.hasCommon ? 1 : -1;
            return a.primaryKanji.localeCompare(b.primaryKanji);
        });

        return groupedSuggestions;
    };

    const getUserKanjiLevels = (userId) => {
        const userLevelMap = {
            '0': ['N5'],           // User 0: Only N5
            '1': ['N5', 'N4'],     // User 1: N5 and N4
            '2': ['N5', 'N4', 'N3'], // Example: User 2 could have N5, N4, N3
            // Add more users as needed
        };
        
        return userLevelMap[userId] || [];
    };

    const getKanjisForLevels = (levels) => {
        const kanjis = new Set();
        
        levels.forEach(level => {
            kanjiData.forEach(dataObj => {
                if (dataObj[level]) {
                    dataObj[level].forEach(kanjiObj => {
                        const kanji = Object.keys(kanjiObj)[0];
                        kanjis.add(kanji);
                    });
                }
            });
        });
        
        return kanjis;
    };

    const findKanjisInWord = (word, userId) => {
        const levels = getUserKanjiLevels(userId);
        const trackedKanjis = getKanjisForLevels(levels);
        const foundKanjis = [];
        
        for (let char of word) {
            if (trackedKanjis.has(char)) {
                foundKanjis.push(char);
            }
        }
        
        return foundKanjis;
    };

    const romanjiMap = {
        'a': 'あ', 'i': 'い', 'u': 'う', 'e': 'え', 'o': 'お',
        
        'ka': 'か', 'ki': 'き', 'ku': 'く', 'ke': 'け', 'ko': 'こ',
        'kya': 'きゃ', 'kyu': 'きゅ', 'kyo': 'きょ',
        
        'sa': 'さ', 'shi': 'し', 'su': 'す', 'se': 'せ', 'so': 'そ',
        'sha': 'しゃ', 'shu': 'しゅ', 'sho': 'しょ',
        
        'ta': 'た', 'chi': 'ち', 'tsu': 'つ', 'te': 'て', 'to': 'と',
        'cha': 'ちゃ', 'chu': 'ちゅ', 'cho': 'ちょ',
        
        'na': 'な', 'ni': 'に', 'nu': 'ぬ', 'ne': 'ね', 'no': 'の',
        'nya': 'にゃ', 'nyu': 'にゅ', 'nyo': 'にょ',
        'n': 'ん',
        
        'ha': 'は', 'hi': 'ひ', 'fu': 'ふ', 'he': 'へ', 'ho': 'ほ',
        'hya': 'ひゃ', 'hyu': 'ひゅ', 'hyo': 'ひょ',
        
        'ma': 'ま', 'mi': 'み', 'mu': 'む', 'me': 'め', 'mo': 'も',
        'mya': 'みゃ', 'myu': 'みゅ', 'myo': 'みょ',
        
        'ya': 'や', 'yu': 'ゆ', 'yo': 'よ',
        
        'ra': 'ら', 'ri': 'り', 'ru': 'る', 're': 'れ', 'ro': 'ろ',
        'rya': 'りゃ', 'ryu': 'りゅ', 'ryo': 'りょ',
        
        'wa': 'わ', 'wo': 'を',
        
        'ga': 'が', 'gi': 'ぎ', 'gu': 'ぐ', 'ge': 'げ', 'go': 'ご',
        'gya': 'ぎゃ', 'gyu': 'ぎゅ', 'gyo': 'ぎょ',
        
        'za': 'ざ', 'ji': 'じ', 'zu': 'ず', 'ze': 'ぜ', 'zo': 'ぞ',
        'ja': 'じゃ', 'ju': 'じゅ', 'jo': 'じょ',
        
        'da': 'だ', 'di': 'ぢ', 'du': 'づ', 'de': 'で', 'do': 'ど',
        
        'ba': 'ば', 'bi': 'び', 'bu': 'ぶ', 'be': 'べ', 'bo': 'ぼ',
        'bya': 'びゃ', 'byu': 'びゅ', 'byo': 'びょ',
        
        'pa': 'ぱ', 'pi': 'ぴ', 'pu': 'ぷ', 'pe': 'ぺ', 'po': 'ぽ',
        'pya': 'ぴゃ', 'pyu': 'ぴゅ', 'pyo': 'ぴょ',
    };

    const romajiMapKatakana = {
        'a': 'ア', 'i': 'イ', 'u': 'ウ', 'e': 'エ', 'o': 'オ',
        
        'ka': 'カ', 'ki': 'キ', 'ku': 'ク', 'ke': 'ケ', 'ko': 'コ',
        'kya': 'キャ', 'kyu': 'キュ', 'kyo': 'キョ',
        
        'sa': 'サ', 'shi': 'シ', 'su': 'ス', 'se': 'セ', 'so': 'ソ',
        'sha': 'シャ', 'shu': 'シュ', 'sho': 'ショ',
        
        'ta': 'タ', 'chi': 'チ', 'tsu': 'ツ', 'te': 'テ', 'to': 'ト',
        'cha': 'チャ', 'chu': 'チュ', 'cho': 'チョ',
        
        'na': 'ナ', 'ni': 'ニ', 'nu': 'ヌ', 'ne': 'ネ', 'no': 'ノ',
        'nya': 'ニャ', 'nyu': 'ニュ', 'nyo': 'ニョ',
        'n': 'ン',
        
        'ha': 'ハ', 'hi': 'ヒ', 'fu': 'フ', 'he': 'ヘ', 'ho': 'ホ',
        'hya': 'ヒャ', 'hyu': 'ヒュ', 'hyo': 'ヒョ',
        
        'ma': 'マ', 'mi': 'ミ', 'mu': 'ム', 'me': 'メ', 'mo': 'モ',
        'mya': 'ミャ', 'myu': 'ミュ', 'myo': 'ミョ',
        
        'ya': 'ヤ', 'yu': 'ユ', 'yo': 'ヨ',
        
        'ra': 'ラ', 'ri': 'リ', 'ru': 'ル', 're': 'レ', 'ro': 'ロ',
        'rya': 'リャ', 'ryu': 'リュ', 'ryo': 'リョ',
        
        'wa': 'ワ', 'wo': 'ヲ',
        
        'ga': 'ガ', 'gi': 'ギ', 'gu': 'グ', 'ge': 'ゲ', 'go': 'ゴ',
        'gya': 'ギャ', 'gyu': 'ギュ', 'gyo': 'ギョ',
        
        'za': 'ザ', 'ji': 'ジ', 'zu': 'ズ', 'ze': 'ゼ', 'zo': 'ゾ',
        'ja': 'ジャ', 'ju': 'ジュ', 'jo': 'ジョ',
        
        'da': 'ダ', 'di': 'ヂ', 'du': 'ヅ', 'de': 'デ', 'do': 'ド',
        
        'ba': 'バ', 'bi': 'ビ', 'bu': 'ブ', 'be': 'ベ', 'bo': 'ボ',
        'bya': 'ビャ', 'byu': 'ビュ', 'byo': 'ビョ',
        
        'pa': 'パ', 'pi': 'ピ', 'pu': 'プ', 'pe': 'ペ', 'po': 'ポ',
        'pya': 'ピャ', 'pyu': 'ピュ', 'pyo': 'ピョ',
    };


    const convertToHiragana = (text, isRealtime = false) => {
        let result = '';
        let i = 0;
    
        while (i < text.length) {
            let matched = false;
            
            for (let len = 3; len >= 1; len--) {
                const substr = text.substr(i, len).toLowerCase();
                
                if (romanjiMap[substr]) {
                    if (isRealtime && substr === 'n' && i + 1 === text.length) {
                        result += 'n';
                        i += len;
                        matched = true;
                        break;
                    }
                    
                    if (substr === 'n' && i + 1 < text.length) {
                        const next = text[i + 1].toLowerCase();
                        if ('aiueoy'.includes(next)) {
                            continue;
                        }
                    }
                    
                    result += romanjiMap[substr];
                    i += len;
                    matched = true;
                    break;
                }
            }
            
            if (!matched) {
                result += text[i];
                i++;
            }
        }
        
        return result;
    };

    const handleInputChangeH = (e) => {
        const romanji = e.target.value;
        
        setRomanjiBuffer(romanji);
        
        const hiragana = convertToHiragana(romanji, true);
        setInputValue(hiragana);
    };

    const convertToKatakana = (text, isRealtime = false) => {
        let result = '';
        let i = 0;

        while (i < text.length) {
            let matched = false;

            for (let len = 3; len >= 1; len--) {
                const substr = text.substr(i, len).toLowerCase();

                if (romajiMapKatakana[substr]) {
                    if (isRealtime && substr === 'n' && i + 1 === text.length) {
                        result += 'n';
                        i += len;
                        matched = true;
                        break;
                    }

                    if (substr === 'n' && i + 1 < text.length) {
                        const next = text[i + 1].toLowerCase();
                        if ('aiueoy'.includes(next)) {
                            continue;
                        }
                    }

                    result += romajiMapKatakana[substr];
                    i += len;
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                result += text[i];
                i++;
            }
        }

        return result;
    };

    const handleInputChangeK = (e) => {
        const romanji = e.target.value;
        
        setRomanjiBuffer(romanji);
        
        const katakana = convertToKatakana(romanji, true);
        setInputValue(katakana);
    };
    const handleAdd = async () => {
        if (!romanjiBuffer.trim()) return;

        // Check if dictionary is available
        if (!dictionaryLoaded) {
            alert("Dictionary data is not available. Please make sure jmdict.json is bundled with the app.");
            return;
        }

        const finalHiragana = convertToHiragana(romanjiBuffer, false);

        const dictionaryForm = toDictionaryForm(finalHiragana);

        const results = searchInDictionary(dictionaryForm);

        if (!results || results.length === 0) {
            alert(`Word "${finalHiragana}" not found in dictionary. Please try a different word.`);
            return;
        }

        if (results.length === 1) {
            const vocabObject = {
                word: finalHiragana,
                meaning: results[0].meaning,
                kanji: results[0].primaryKanji
            };

            setWords(prev => [...prev, vocabObject]);
            setInputValue('');
            setRomanjiBuffer('');
        } else {
            // Multiple results - show suggestions
            setSuggestions(results);
            setShowSuggestions(true);
        }
    };

    const handleSelectSuggestion = (suggestion) => {
        const vocabObject = {
            word: suggestion.word,
            meaning: suggestion.meaning,
            kanji: suggestion.primaryKanji
        };

        setWords(prev => [...prev, vocabObject]);
        setInputValue('');
        setRomanjiBuffer('');
        setShowSuggestions(false);
        setSuggestions([]);
    };

    const handleCancelSuggestions = () => {
        setShowSuggestions(false);
        setSuggestions([]);
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleAdd();
        }
    };

    const removeElement = (id) => {
        setWords(prevItems => prevItems.filter((_, index) => index !== id));
    };

    const toDictionaryForm = (word) => {
    if (word.endsWith("ます")) {
        const stem = word.slice(0, -2);

        const godanMap = {
            "き": "く",
            "ぎ": "ぐ",
            "し": "す",
            "ち": "つ",
            "に": "ぬ",
            "び": "ぶ",
            "み": "む",
            "り": "る",
        };

        const lastChar = stem.slice(-1);

        if (godanMap[lastChar]) {
            return stem.slice(0, -1) + godanMap[lastChar];
        }

        return stem + "る";
    }

    return word;
};


    const handleSubmitArray = async (array) => {
        if (array.length === 0) return;

        const safeArray = array.filter(
            w => w.word && w.meaning && w.kanji
        );

        if (safeArray.length === 0) return;

        try {
            const vocabRef = ref(db, `${user}/vocab`);
            const snapshot = await get(vocabRef);
            const data = snapshot.exists() ? snapshot.val() : {};

            const existingWords = data.words || [];
            const existingCount = data.totalCount || 0;

            const updatedWords = [...existingWords, ...safeArray];

            await update(vocabRef, {
                words: updatedWords,
                totalCount: existingCount + safeArray.length
            });

            const userLevels = getUserKanjiLevels(user);
            if (userLevels.length > 0) {
                await updateKanjiTracking(safeArray);
            }

            setWords([]);

        } catch (error) {
            console.error("Firebase error:", error);
        }
    };

    const updateKanjiTracking = async (vocabArray) => {
        try {
            const kanjiRef = ref(db, `${user}/kanji`);
            const snapshot = await get(kanjiRef);
            const existingKanjiData = snapshot.exists() ? snapshot.val() : {};

            vocabArray.forEach(vocabItem => {
                const kanjisInWord = findKanjisInWord(vocabItem.kanji, user);
                
                kanjisInWord.forEach(kanji => {
                    if (!existingKanjiData[kanji]) {
                        existingKanjiData[kanji] = [];
                    }
                    
                    const isDuplicate = existingKanjiData[kanji].some(
                        v => v.word === vocabItem.word && v.kanji === vocabItem.kanji
                    );
                    
                    if (!isDuplicate) {
                        existingKanjiData[kanji].push({
                            word: vocabItem.word,
                            kanji: vocabItem.kanji,
                            meaning: vocabItem.meaning
                        });
                    }
                });
            });

            await update(kanjiRef, existingKanjiData);
            
        } catch (error) {
            console.error("Kanji tracking error:", error);
        }
    };

    return(
        <div className='VocabSection'>
            <div className='VocabBanner'>
                <h2 className='VocabText'>VOCAB</h2>
            </div>
            <div className='VocabContents'>
                {dictionaryLoaded && (
                    <div style={{ 
                        marginTop: '15px', 
                        padding: '10px', 
                        backgroundColor: '#d4edda', 
                        borderRadius: '6px',
                        color: '#155724',
                        fontSize: '14px'
                    }}>
                        ✓ Dictionary loaded: {jmdictData.words.length.toLocaleString()} entries
                    </div>
                )}

                {/* Suggestions Modal */}
                {showSuggestions && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 1000
                    }}>
                        <div style={{
                            backgroundColor: 'white',
                            borderRadius: '12px',
                            padding: '30px',
                            maxWidth: '600px',
                            maxHeight: '80vh',
                            overflow: 'auto',
                            boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
                        }}>
                            <h3 style={{ 
                                marginBottom: '20px',
                                fontSize: '24px',
                                color: '#333'
                            }}>
                                Select the correct meaning:
                            </h3>
                            
                            <div style={{ marginBottom: '20px' }}>
                                {suggestions.map((suggestion, index) => (
                                    <div
                                        key={index}
                                        onClick={() => handleSelectSuggestion(suggestion)}
                                        style={{
                                            padding: '15px',
                                            marginBottom: '10px',
                                            backgroundColor: '#f8f9fa',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            border: '2px solid transparent',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = '#e9ecef';
                                            e.currentTarget.style.borderColor = '#d36cff';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = '#f8f9fa';
                                            e.currentTarget.style.borderColor = 'transparent';
                                        }}
                                    >
                                        <div style={{ 
                                            fontSize: '20px', 
                                            fontWeight: 'bold',
                                            marginBottom: '5px',
                                            color: '#d36cff'
                                        }}>
                                            {suggestion.word} ({suggestion.kanjiVariants.map(k => k.text).join(' / ')})
                                        </div>
                                        <div style={{ 
                                            fontSize: '16px',
                                            color: '#555',
                                            marginBottom: '5px'
                                        }}>
                                            {suggestion.meaning}
                                        </div>
                                        {suggestion.partOfSpeech && (
                                            <div style={{ 
                                                fontSize: '12px',
                                                color: '#888',
                                                fontStyle: 'italic'
                                            }}>
                                                {suggestion.partOfSpeech}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={handleCancelSuggestions}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    backgroundColor: '#6c757d',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '16px',
                                    fontWeight: '600'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#5a6268';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = '#6c757d';
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                <p>Add New Japanese Word</p>
                <div className='VocabInput'>
                    <input 
                        type='text' 
                        placeholder='ことば / Word' 
                        value={inputValue} 
                        onChange={toggle?  handleInputChangeH : handleInputChangeK} 
                        onKeyPress={handleKeyPress}
                        disabled={!dictionaryLoaded}
                    />
                    <button className='LanguageChange' onClick={()=> {setToggle(!toggle)}}>{toggle ? "あ" : "ア"}</button>
                    <button 
                        className='SubmitButton' 
                        onClick={() => handleSubmitArray(words)} 
                        disabled={words.length === 0}
                    >
                        Submit
                    </button>
                    <div
                        className='changeSection'
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                            setIsRevisionMode(prev => !prev);
                            setRevisionQuestion(null);
                            setRevisionLocked(false);
                            setWrongAnswers([]);
                            setCorrectCount(0);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setIsRevisionMode(prev => !prev);
                                setRevisionQuestion(null);
                                setRevisionLocked(false);
                                setWrongAnswers([]);
                                setCorrectCount(0);
                            }
                        }}
                    >
                        {isRevisionMode ? 'Back to Vocab' : 'Vocab Revision'}
                    </div>
                </div>
                <div className='AddedWords'>
                    <ul className='AddedWordsSection'>
                        {words.map((w, index) => (
                            <li 
                                key={index} 
                                style={{
                                    backgroundColor: '#d36cff',
                                    paddingInline: '10px',
                                    borderRadius: '8px'
                                }}
                                onClick={() => removeElement(index)}
                            >
                                {w.word} ({w.kanji}) — {w.meaning}
                            </li>
                        ))}
                    </ul>
                </div>

                {!isRevisionMode && (
                    <>
                        <p>{wordCount + 2} Words Learned</p>
                        <div className="words">
                            <div className='lines'></div>
                            <ul className='list'>
                                {uploadedWord.map((w, index) => (
                                    <li key={index} style={{fontSize:'18px'}}>
                                        {index+1}. {w.word} - ({w.kanji}) - {w.meaning}
                                    </li>
                                ))}
                                <li>ようこそ</li>
                                <li>ありがとうございます</li>
                            </ul>
                        </div>
                    </>
                )}

                {isRevisionMode && (
                    <div className="RevisionLayout">
                        <div className="RevisionMain">
                            <div className="RevisionHeader">
                                <div className="RevisionScore">
                                    Correct: <span className="RevisionScoreNumber">{correctCount}</span>
                                    <span style={{ marginLeft: '10px' }}>
                                        {users.length > 0 ? (
                                            <>
                                                {users.map((u, idx) => (
                                                    <span key={u.id} style={{ marginLeft: idx === 0 ? 0 : '10px' }}>
                                                        Max ({getUserDisplayName(u.id)}):{" "}
                                                        <span className="RevisionScoreNumber">{Number(maxScoresByUser?.[u.id] ?? 0)}</span>
                                                    </span>
                                                ))}
                                            </>
                                        ) : (
                                            <>
                                                Max ({userName || user}):{" "}
                                                <span className="RevisionScoreNumber">{Number(maxScoresByUser?.[user] ?? 0)}</span>
                                            </>
                                        )}
                                    </span>
                                </div>
                                <div>
                                <button
                                    className="RevisionExtra"
                                    onClick={toggleExtraRevise}
                                    disabled={revisionLocked}
                                    title="Revise only starred questions"
                                >
                                    {isExtraRevise ? 'Normal revise' : 'Extra revise'}
                                </button>
                                <button
                                    className="RevisionStar"
                                    onClick={toggleStarCurrentQuestion}
                                    disabled={revisionLocked || !revisionQuestion}
                                    title={isCurrentQuestionStarred ? 'Unstar this question' : 'Star this question'}
                                >
                                    {isCurrentQuestionStarred ? '★' : '☆'}
                                </button>
                                <button
                                    className="RevisionFlip"
                                    onClick={flipRevisionMode}
                                    disabled={revisionLocked || validRevisionPool.length === 0}
                                    title="Flip question/answer direction"
                                >
                                    Flip
                                </button>
                                <button
                                    className="RevisionNext"
                                    onClick={() => {
                                        if (revisionLocked) return;
                                        startNextRevisionQuestion();
                                    }}
                                    disabled={revisionLocked}
                                >
                                    Skip
                                </button>
                                </div>
                            </div>

                            {uploadedWord.filter(w => w && w.word && w.kanji && w.meaning).length < 6 ? (
                                <div className="RevisionCard">
                                    Add at least 6 saved words to start revision.
                                </div>
                            ) : isExtraRevise && starredKeysForMode.length === 0 ? (
                                <div className="RevisionCard">
                                    No starred questions yet for this mode. Use ☆ to star questions, then come back to Extra revise.
                                </div>
                            ) : !revisionQuestion ? (
                                <div className="RevisionCard">
                                    You’ve gone through all saved words for this session. Leave/reload the page to restart.
                                </div>
                            ) : (
                                <div className="RevisionCard">
                                    <div className="RevisionPrompt">
                                        {revisionQuestion?.mode === 'en_to_jp' ? (
                                            <div className="RevisionKana" style={{ width: '100%' }}>
                                                {revisionQuestion?.meaning}
                                            </div>
                                        ) : (
                                            <>
                                                <div className="RevisionKana">{revisionQuestion?.word}</div>
                                                <div className="RevisionKanji">{revisionQuestion?.kanji}</div>
                                            </>
                                        )}
                                    </div>

                                    <div className="RevisionOptions">
                                        {(revisionQuestion?.options || []).map((opt, idx) => (
                                            <button
                                                key={`${opt}-${idx}`}
                                                className="RevisionOption"
                                                disabled={revisionLocked}
                                                onClick={() => {
                                                    if (revisionLocked || !revisionQuestion) return;
                                                    setRevisionLocked(true);

                                                    const isCorrect = opt === revisionQuestion.correctAnswer;
                                                    if (isCorrect) {
                                                        setCorrectCount(c => c + 1);
                                                    } else {
                                                        setWrongAnswers(prev => ([
                                                            {
                                                                mode: revisionQuestion.mode,
                                                                prompt: revisionQuestion.mode === 'en_to_jp' ? revisionQuestion.meaning : `${revisionQuestion.word} (${revisionQuestion.kanji})`,
                                                                word: revisionQuestion.word,
                                                                kanji: revisionQuestion.kanji,
                                                                meaning: revisionQuestion.meaning,
                                                                correctAnswer: revisionQuestion.correctAnswer,
                                                                chosenAnswer: opt
                                                            },
                                                            ...prev
                                                        ]));
                                                    }

                                                    window.setTimeout(() => {
                                                        startNextRevisionQuestion();
                                                    }, 450);
                                                }}
                                            >
                                                {opt}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="RevisionSidebar">
                            <div className="RevisionSidebarTitle">Wrong answers</div>
                            {wrongAnswers.length === 0 ? (
                                <div className="RevisionSidebarEmpty">No wrong answers yet.</div>
                            ) : (
                                <ul className="RevisionWrongList">
                                    {wrongAnswers.map((w, i) => (
                                        <li key={`${w.word}-${w.kanji}-${i}`} className="RevisionWrongItem">
                                            <div className="RevisionWrongWord">
                                                {w.mode === 'en_to_jp' ? w.meaning : `${w.word} (${w.kanji})`}
                                            </div>
                                            <div className="RevisionWrongMeta">
                                                Correct: {w.correctAnswer}
                                            </div>
                                            <div className="RevisionWrongMeta">
                                                You chose: {w.chosenAnswer}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default VocabSection;