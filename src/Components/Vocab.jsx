import './Vocab.css'
import { useState, useEffect, useMemo, useRef } from 'react';
import { ref, push, update, get, child, onValue, set, remove } from "firebase/database";
import db from './firebase'
import jmdictData from '../data/jmdict.json';


const VocabSection = ({user, userName, users = [], selectedLevel = 'N5'}) => {
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
    const [isQuestionLoading, setIsQuestionLoading] = useState(false);
    const revisionSessionRef = useRef({ sig: '', remainingIds: [], asked: new Set() });

    const BACKEND_URL = 'https://nihongono-practice.onrender.com/';
    const [maxScoresByUser, setMaxScoresByUser] = useState({});
    
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    useEffect(() => {
        // Reset per-user revision session/UI state when switching users
        setRevisionQuestion(null);
        setRevisionLocked(false);
        setCorrectCount(0);
        setWrongAnswers([]);
        revisionSessionRef.current = { sig: '', remainingIds: [], asked: new Set() };

        const vocabRef = ref(db, `${user}/vocab`);

        const unsubscribe = onValue(vocabRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                if (Array.isArray(data)) {
                    setUploadedWords(data);
                    setWordCount(data.length);
                    setMaxScoresByUser(prev => ({ ...prev, [user]: 0 }));
                } else {
                    setUploadedWords(data.words ?? []);
                    setWordCount(data.totalCount ?? 0);
                    setMaxScoresByUser(prev => ({ ...prev, [user]: Number(data.revisionMaxScore ?? 0) }));
                }
            } else {
                setUploadedWords([]);
                setWordCount(0);
                setMaxScoresByUser(prev => ({ ...prev, [user]: 0 }));
            }
        });

        return () => unsubscribe();
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
        return (uploadedWord || [])
            .map((w, idx) => ({ ...w, id: w.id ?? idx }))
            .filter(w => w.word && w.meaning);
    }, [uploadedWord]);

    const overallConfidence = useMemo(() => {
        if (!uploadedWord || uploadedWord.length === 0) return 100;
        const totalConf = uploadedWord.reduce((sum, w) => sum + (w.confidence ?? 50), 0);
        return Math.round(totalConf / uploadedWord.length);
    }, [uploadedWord]);

    const updateWordConfidence = (wordId, wordText, wordMeaning, isCorrect) => {
        if (user === undefined || user === null || user === '') return;

        let targetIndex = uploadedWord.findIndex(w =>
            w && wordText && w.word && w.word.trim() === wordText.trim() &&
            w.meaning && wordMeaning && w.meaning.trim() === wordMeaning.trim()
        );

        if (targetIndex === -1) {
            targetIndex = uploadedWord.findIndex(w =>
                w && wordText && w.word && w.word.trim() === wordText.trim()
            );
        }

        if (targetIndex === -1) {
            targetIndex = uploadedWord.findIndex((w, idx) =>
                (w.id !== undefined && w.id === wordId) || idx === wordId
            );
        }

        if (targetIndex === -1) return;

        const currentWord = uploadedWord[targetIndex];
        const currentConfidence = Number(currentWord?.confidence ?? 0);

        // Boost +25% on correct answer, decrease by -15% on wrong answer (clamped between 0 and 100)
        const delta = isCorrect ? 25 : -15;
        const newConfidence = Math.max(0, Math.min(100, currentConfidence + delta));

        console.log(`[Confidence Update] TargetIndex: ${targetIndex}, Word: "${wordText}", isCorrect: ${isCorrect}, Old: ${currentConfidence}, New: ${newConfidence}`);

        // 1. Update local React state immediately
        setUploadedWords(prevWords => {
            const updated = [...prevWords];
            updated[targetIndex] = {
                ...updated[targetIndex],
                confidence: newConfidence
            };
            return updated;
        });

        // 2. Persist to Firebase Realtime Database across all root structure variations
        const pathsToUpdate = [
            `${user}/words/${targetIndex}/confidence`,
            `${user}/vocab/words/${targetIndex}/confidence`,
            `${user}/vocab/${targetIndex}/confidence`
        ];

        pathsToUpdate.forEach(path => {
            const nodeRef = ref(db, path);
            set(nodeRef, newConfidence).catch(() => {});
        });

        // 3. Persist to Weaviate database via Flask backend
        fetch(`${BACKEND_URL}/api/update-vocab-confidence`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                word: wordText,
                kanji: currentWord?.kanji || '',
                meaning: wordMeaning,
                level: currentWord?.level || selectedLevel || 'N5',
                confidence: newConfidence
            })
        }).then(res => res.json()).then(resData => {
            console.log('[Weaviate Sync] Updated confidence in Weaviate:', resData);
        }).catch(err => {
            console.error('[Weaviate Sync Error] Failed to update confidence in Weaviate:', err);
        });
    };

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

    const initRevisionSessionIfNeeded = (forceReset = false) => {
        // Base signature strictly on word IDs so live confidence updates mid-session don't reset the asked set
        const sig = validRevisionPool.map(v => v.id).join('||');
        if (!forceReset && revisionSessionRef.current.sig === sig && (revisionSessionRef.current.remainingIds?.length ?? 0) > 0) return;

        // Sort pool by confidence ascending (lowest confidence score words first)
        const sortedPool = [...validRevisionPool].sort((a, b) => {
            const confA = Number(a.confidence ?? 0);
            const confB = Number(b.confidence ?? 0);
            return confA - confB;
        });

        revisionSessionRef.current.sig = sig;
        revisionSessionRef.current.asked = new Set();
        revisionSessionRef.current.remainingIds = sortedPool.map(v => v.id);
    };

    const startNextRevisionQuestion = async (overrideMode) => {
        initRevisionSessionIfNeeded();

        const asked = revisionSessionRef.current.asked;
        const remaining = revisionSessionRef.current.remainingIds;

        while (remaining.length > 0 && asked.has(remaining[0])) {
            remaining.shift();
        }

        const nextId = remaining.shift();
        if (nextId === undefined || nextId === null) {
            setRevisionQuestion(null);
            setRevisionLocked(false);
            return;
        }

        asked.add(nextId);
        const item = validRevisionPool.find(v => v.id === nextId);
        const modeToUse = overrideMode || revisionMode;

        setIsQuestionLoading(true);
        setRevisionLocked(true);

        try {
            const res = await fetch(`${BACKEND_URL}/api/generate-vocab-question`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    word: item.word,
                    kanji: item.kanji,
                    meaning: item.meaning,
                    level: item.level,
                    mode: modeToUse,
                }),
            });

            if (!res.ok) throw new Error(`Backend error: ${res.status}`);
            const data = await res.json();

            setRevisionQuestion({
                id: nextId,
                mode: modeToUse,
                word: data.word,
                kanji: data.kanji,
                meaning: data.meaning ?? item.meaning,
                correctAnswer: data.correctAnswer,
                options: data.options,
            });
        } catch (err) {
            console.error('Failed to fetch question from backend:', err);
            setRevisionQuestion({ error: err.message });
        } finally {
            setIsQuestionLoading(false);
            setRevisionLocked(false);
        }
    };

    const flipRevisionMode = () => {
        const nextMode = revisionMode === 'jp_to_en' ? 'en_to_jp' : 'jp_to_en';
        setRevisionMode(nextMode);
        setRevisionLocked(false);
        setRevisionQuestion(null);
        // fetch a fresh question in the new mode
        setTimeout(() => startNextRevisionQuestion(nextMode), 0);
    };

    useEffect(() => {
        if (!isRevisionMode) return;
        initRevisionSessionIfNeeded();
        if (!revisionQuestion) {
            startNextRevisionQuestion();
        }
    }, [isRevisionMode, validRevisionPool]);


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
        return new Set();
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
                kanji: results[0].primaryKanji,
                level: selectedLevel || "N5"
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
            kanji: suggestion.primaryKanji,
            level: selectedLevel || "N5"
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

            // Also sync newly added words to Weaviate vector database
            fetch(`${BACKEND_URL}/api/add-vocab`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    words: safeArray.map(w => ({
                        word: w.word,
                        kanji: w.kanji || '',
                        meaning: w.meaning,
                        level: w.level || selectedLevel || 'N5',
                        confidence: w.confidence ?? 0
                    }))
                })
            }).then(res => res.json()).then(resData => {
                console.log('[Weaviate Sync] Added new words to Weaviate:', resData);
            }).catch(err => {
                console.error('[Weaviate Sync Error] Failed to add words to Weaviate:', err);
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
                <h2 className='VocabText'>語彙 | Vocabulary</h2>
                <span className='VocabSubtitle'>Master Essential Vocabulary & Interactive Flashcards</span>
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
                                            e.currentTarget.style.backgroundColor = '#f3f4f6';
                                            e.currentTarget.style.borderColor = '#c5050c';
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
                                            color: '#c5050c'
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

                <div className='VocabInputCard'>
                    <h3 className='VocabInputCardTitle'>Add New Japanese Word</h3>
                    
                    <div className='VocabInputRow'>
                        <input 
                            className='VocabInputField'
                            type='text' 
                            placeholder='Type word in Romaji (e.g. taberu)...' 
                            value={inputValue} 
                            onChange={toggle ? handleInputChangeH : handleInputChangeK} 
                            onKeyPress={handleKeyPress}
                            disabled={!dictionaryLoaded}
                        />
                        <button 
                            className='LanguageChange' 
                            onClick={() => setToggle(!toggle)}
                            title="Toggle Hiragana / Katakana input mode"
                        >
                            {toggle ? "あ" : "ア"}
                        </button>
                        <button 
                            className='AddWordBtn' 
                            onClick={handleAdd}
                            disabled={!romanjiBuffer.trim()}
                        >
                            + Add Word
                        </button>
                    </div>

                    <div className='VocabToolsRow'>
                        <button
                            className='ModeToggleBtn'
                            onClick={() => {
                                setIsRevisionMode(prev => !prev);
                                setRevisionQuestion(null);
                                setRevisionLocked(false);
                                setWrongAnswers([]);
                                setCorrectCount(0);
                                revisionSessionRef.current = { sig: '', remainingIds: [], asked: new Set() };
                            }}
                        >
                            {isRevisionMode ? '← Back to Vocab List' : '📖 Vocab Revision Session'}
                        </button>
                    </div>
                </div>

                {words.length > 0 && (
                    <div className='AddedWordsContainer'>
                        <div className='AddedWordsHeader'>
                            <span className='AddedWordsTitle'>Pending Words to Save ({words.length})</span>
                            <button 
                                className='SubmitButton' 
                                onClick={() => handleSubmitArray(words)}
                            >
                                Save {words.length} Word{words.length > 1 ? 's' : ''} to Account
                            </button>
                        </div>
                        <ul className='AddedWordsSection'>
                            {words.map((w, index) => (
                                <li key={index} className='AddedWordChip'>
                                    <span>{w.word} ({w.kanji}) — {w.meaning}</span>
                                    <span 
                                        className='AddedWordChipRemove' 
                                        onClick={() => removeElement(index)}
                                        title="Remove word"
                                    >
                                        ✕
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {!isRevisionMode && (
                    <div className="WordsSectionCard">
                        <div className="SectionCardHeader" style={{ justifyContent: 'space-between', width: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="SectionCardIcon">📚</span>
                                <h3>{uploadedWord.length > 0 ? uploadedWord.length : wordCount} Words Learned</h3>
                            </div>
                            <div className="ConfidenceScoreBadge">
                                🎯 Confidence: <strong>{overallConfidence}%</strong>
                            </div>
                        </div>
                        <ul className="WordsGridList">
                            {uploadedWord.map((w, index) => {
                                const itemConfidence = Number(w.confidence ?? 0);
                                return (
                                    <li key={index} className="WordCardItem">
                                        <div className="WordCardConfidenceBar" style={{ width: `${itemConfidence}%` }} />
                                        <div className="WordCardHeader">
                                            <div className="WordCardJapanese">
                                                <span className="WordCardMain">{w.word}</span>
                                                {w.kanji && <span className="WordCardKanji">({w.kanji})</span>}
                                            </div>
                                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                <span className="WordCardLevelBadge">{w.level || selectedLevel || 'N5'}</span>
                                                <span className="WordCardConfidenceTag">{itemConfidence}%</span>
                                            </div>
                                        </div>
                                        <div className="WordCardMeaning">{w.meaning}</div>
                                    </li>
                                );
                            })}
                            <li className="WordCardItem">
                                <div className="WordCardConfidenceBar" style={{ width: '100%' }} />
                                <div className="WordCardJapanese">
                                    <span className="WordCardMain">ようこそ</span>
                                </div>
                                <div className="WordCardMeaning">Welcome</div>
                            </li>
                            <li className="WordCardItem">
                                <div className="WordCardConfidenceBar" style={{ width: '100%' }} />
                                <div className="WordCardJapanese">
                                    <span className="WordCardMain">ありがとうございます</span>
                                </div>
                                <div className="WordCardMeaning">Thank you very much</div>
                            </li>
                        </ul>
                    </div>
                )}

                {isRevisionMode && (
                    <div className="RevisionLayout">
                        <div className="RevisionMain">
                            <div className="RevisionHeader">
                                <div className="RevisionScore">
                                    Correct: <span className="RevisionScoreNumber">{correctCount}</span>
                                    <span style={{ marginLeft: '12px' }}>
                                        Confidence: <span className="RevisionScoreNumber">{overallConfidence}%</span>
                                    </span>
                                    <span style={{ marginLeft: '12px' }}>
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

                            ) : isQuestionLoading ? (
                                <div className="RevisionCard RevisionCardLoading">
                                    <div className="RevisionSpinner"></div>
                                    <p className="RevisionLoadingText">Fetching question from Weaviate...</p>
                                </div>
                            ) : revisionQuestion?.error ? (
                                <div className="RevisionCard">
                                    <div style={{ color: '#c5050c', fontWeight: 700, marginBottom: '8px' }}>&#9888;&#65039; Backend Error</div>
                                    <div style={{ fontSize: '13px', color: '#555', marginBottom: '16px' }}>{revisionQuestion.error}</div>
                                    <button className="RevisionNext" onClick={() => startNextRevisionQuestion()}>Try Again</button>
                                </div>
                            ) : !revisionQuestion ? (
                                <div className="RevisionCard">
                                    <div style={{ marginBottom: '16px', fontWeight: 600, color: '#333' }}>
                                        🎉 You’ve gone through all saved words for this session!
                                    </div>
                                    <button 
                                        className="RevisionNext" 
                                        style={{ margin: '0 auto', display: 'block' }}
                                        onClick={() => {
                                            initRevisionSessionIfNeeded(true);
                                            startNextRevisionQuestion();
                                        }}
                                    >
                                        🔄 Restart Revision Session
                                    </button>
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

                                                    const isCorrect = revisionQuestion.mode === 'en_to_jp'
                                                        ? (opt.includes(revisionQuestion.word) || (revisionQuestion.kanji && opt.includes(revisionQuestion.kanji)) || String(opt).trim().toLowerCase() === String(revisionQuestion.correctAnswer).trim().toLowerCase())
                                                        : String(opt).trim().toLowerCase() === String(revisionQuestion.correctAnswer).trim().toLowerCase();
                                                    updateWordConfidence(
                                                        revisionQuestion.id,
                                                        revisionQuestion.word,
                                                        revisionQuestion.meaning,
                                                        isCorrect
                                                    );

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