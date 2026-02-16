import './Vocab.css'
import { useState, useEffect, useMemo, use } from 'react';
import { ref, push, update, get, child, onValue } from "firebase/database";
import db from './firebase'
import kanjiData from './Kanjis.json';
import jmdictData from '../data/jmdict.json';


const VocabSection = ({user}) => {
    const [inputValue, setInputValue] = useState('');
    const [wordCount, setWordCount] = useState(0);
    const [romanjiBuffer, setRomanjiBuffer] = useState(''); 
    const [words, setWords] = useState([]);
    const [uploadedWord, setUploadedWords] = useState([]);
    const [toggle,setToggle] = useState(false);
    
    const [jmdictData, setJmdictData] = useState(null);
    const [dictionaryLoaded, setDictionaryLoaded] = useState(false);
    
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    useEffect(() => {
        const vocabRef = ref(db, `${user}/vocab`);

        const unsubscribe = onValue(vocabRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                setUploadedWords(data.words ?? []);
                setWordCount(data.totalCount ?? 0);
            } else {
                setUploadedWords([]);
                setWordCount(0);
            }
        });

        return () => unsubscribe();
    }, []);

    // Auto-load dictionary on mount - try localStorage first, then imported file
    useEffect(() => {
        const loadDictionary = () => {
            // First, try to load from localStorage
            const storedDict = localStorage.getItem('jmdict_dictionary');
            if (storedDict) {
                try {
                    const parsedData = JSON.parse(storedDict);
                    if (parsedData && parsedData.words && Array.isArray(parsedData.words)) {
                        setJmdictData(parsedData);
                        setDictionaryLoaded(true);
                        console.log('Dictionary loaded from localStorage:', parsedData.words.length.toLocaleString(), 'entries');
                        return;
                    }
                } catch (err) {
                    console.error('Error parsing stored dictionary:', err);
                    localStorage.removeItem('jmdict_dictionary'); // Remove corrupted data
                }
            }

            // If not in localStorage, use the imported dictionary file (imported at top of file)
            // jmdictData is imported from '../data/jmdict.json'
            if (jmdictData && jmdictData.words && Array.isArray(jmdictData.words)) {
                setJmdictData(jmdictData);
                setDictionaryLoaded(true);
                // Store in localStorage for future use
                try {
                    localStorage.setItem('jmdict_dictionary', JSON.stringify(jmdictData));
                    console.log('Dictionary loaded from imported file and saved to localStorage:', jmdictData.words.length.toLocaleString(), 'entries');
                } catch (err) {
                    console.error('Error saving dictionary to localStorage:', err);
                    // localStorage might be full, but continue anyway
                }
            } else {
                console.warn('Imported jmdict.json not found or invalid. Please upload manually.');
            }
        };

        loadDictionary();
    }, []); // Empty dependency array - only run once on mount

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

    const handleDictionaryUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                setJmdictData(data);
                setDictionaryLoaded(true);
                
                // Save to localStorage for persistence
                try {
                    localStorage.setItem('jmdict_dictionary', JSON.stringify(data));
                    console.log('Dictionary saved to localStorage');
                } catch (err) {
                    console.error('Error saving dictionary to localStorage:', err);
                    // Continue even if localStorage fails
                }
                
                alert(`Dictionary loaded: ${data.words.length.toLocaleString()} entries`);
            } catch (err) {
                alert("Failed to parse dictionary file: " + err.message);
            }
        };
        reader.onerror = () => {
            alert("Failed to read file");
        };
        reader.readAsText(file);
    };

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

        // Check if dictionary is loaded
        if (!dictionaryLoaded) {
            alert("Please upload the JMdict dictionary file first!");
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
                {!dictionaryLoaded && (
                    <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#fff3cd', borderRadius: '8px',border: '1px solid #ffc107'}}>
                        <p style={{ marginBottom: '10px', fontWeight: 'bold' }}>
                            📚 Loading JMdict Dictionary...
                        </p>
                        <p style={{ marginBottom: '10px', fontSize: '14px', color: '#666' }}>
                            If the dictionary doesn't load automatically, you can upload it manually:
                        </p>
                        <label style={{
                            display: 'inline-block',
                            padding: '10px 20px',
                            backgroundColor: '#007bff',
                            color: 'white',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: '600'
                        }}>
                            Upload jmdict.json
                            <input 
                                type="file" 
                                accept=".json"
                                onChange={handleDictionaryUpload}
                                style={{ display: 'none' }}
                            />
                        </label>
                    </div>
                )}

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
            </div>
        </div>
    );
}

export default VocabSection;