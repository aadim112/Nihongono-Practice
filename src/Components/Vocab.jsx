import './Vocab.css'
import { useState,useEffect } from 'react';
import { ref, push, update, get, child,onValue } from "firebase/database";
import db from './firebase'

const VocabSection = ({}) =>{
    const [inputValue, setInputValue] = useState('');
    const [wordCount,setWordCount] = useState(0);
    const [romanjiBuffer, setRomanjiBuffer] = useState(''); // Track romanji input
    const [words, setWords] = useState([]);
    const [uploadedWord,setUploadedWords] = useState([]);

    useEffect(() => {
  const vocabRef = ref(db, "vocab");

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

    const handleInputChange = (e) => {
        const romanji = e.target.value;

        //const isDeleting = romanji.length < romanjiBuffer.length;
        
        setRomanjiBuffer(romanji);
        
        const hiragana = convertToHiragana(romanji, true);
        setInputValue(hiragana);
    };

    const handleAdd = async () => {
        if (!romanjiBuffer.trim()) return;

        const finalHiragana = convertToHiragana(romanjiBuffer, false);

        try {
            const res = await fetch("http://localhost:5000/api/analyze-vocab", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ word: finalHiragana })
            });

            const data = await res.json();

            const vocabObject = {
                word: finalHiragana,
                meaning: data?.meaning || "",
                kanji: data?.kanji || finalHiragana
            };

            setWords(prev => [...prev, vocabObject]);
            setInputValue('');
            setRomanjiBuffer('');

        } catch (err) {
            console.error("Vocab fetch failed:", err);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleAdd();
        }
    };

    const removeElement = (id) => {
        setWords(prevItems => prevItems.filter((_, index) => index !== id));
    };

    const handleSubmitArray = async (array) => {
        if (array.length === 0) return;

        const safeArray = array.filter(
            w => w.word && w.meaning && w.kanji
        );

        if (safeArray.length === 0) return;

        try {
            const vocabRef = ref(db, "vocab");
            const snapshot = await get(vocabRef);
            const data = snapshot.exists() ? snapshot.val() : {};

            const existingWords = data.words || [];
            const existingCount = data.totalCount || 0;

            const updatedWords = [...existingWords, ...safeArray];

            await update(vocabRef, {
            words: updatedWords,
            totalCount: existingCount + safeArray.length
            });

            setWords([]);

        } catch (error) {
            console.error("Firebase error:", error);
        }
    };





    return(
    <div className='VocabSection'>
        <div className='VocabBanner'>
            <h2 className='VocabText'>VOCAB</h2>
        </div>
        <div className='VocabContents'>
            <p>Add New Japanese Word</p>
            <div className='VocabInput'>
                <input type='text' placeholder='ことば / Word' value={inputValue} onChange={handleInputChange} onKeyPress={handleKeyPress}/>
                <button className='SubmitButton' onClick={()=>handleSubmitArray(words)} disabled={words.length === 0}>Submit</button>
            </div>
            <div className='AddedWords'>
              <ul className='AddedWordsSection'>
                {words.map((w, index) => (
                    <li key={index} style={{backgroundColor: '#d36cff',paddingInline: '10px',borderRadius: '8px'}}onClick={() => removeElement(index)}>
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
                    <li key={index}>
                        {w.word} ({w.kanji}) — {w.meaning}
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