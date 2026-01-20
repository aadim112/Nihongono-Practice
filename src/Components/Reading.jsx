import './Reading.css';
import grammar from './Grammar.json';
import reading from '../Assets/reading.png';
import db from './firebase';
import { ref,get, set,update,runTransaction } from 'firebase/database';
import { useState,useEffect } from 'react';

const Reading = ({}) => {
    const [text,setText] = useState('Loading');
    const [LearnedGrammar,setLearnedGrammar] = useState([]);
    const [LearnedVocab,setLearnedVocab] = useState([]);
    const [Sentences,setSentences] = useState([]);
    const [tab,setTab] = useState(0);
    const [trueTranslation,setTrueTranslation] = useState('');
    const [results, setResult] = useState({score: 0,results: []});


    const getTodayDate = () => {
        const today = new Date();
        return today.toISOString().split("T")[0];
    };

    async function GenerateData(grammar,vocab){
        const response = await fetch("http://127.0.0.1:5000/api/generate-reading", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({grammar,vocab})
        });

        if (!response.ok) {
            throw new Error("Backend error");
        }

        const data = await response.json();
        return data.text;
    };


    function getGrammarForApi(grammarLearnedIds, allGrammar) {
        if (!Array.isArray(grammarLearnedIds)) return [];

        const learnedSet = new Set(grammarLearnedIds);

        return allGrammar
            .filter(g => learnedSet.has(g.id))
            .map(g => ({
                pattern: g.pattern,
                meaning: g.meaning
            }));
    }

    const handleSubmit = async () => {
        try {
            const data = await SubmitAnswer();
            setResult(data);
            setTab(1); 
        } catch (err) {
            console.error(err);
        }
    };



    useEffect(() => {
        const fetchReadingData = async () => {
            try {
                const today = getTodayDate();

                const readingRef = ref(db, "ReadingGenerationDates");
                const resultRef = ref(db,"Result");
                const vocabRef = ref(db, "vocab/words");
                const grammarRef = ref(db, "grammar/GrammarLearned");

                const [readingSnap, vocabSnap, grammarSnap] = await Promise.all([
                    get(readingRef),
                    get(vocabRef),
                    get(grammarRef),
                    get(resultRef),
                ]);

                if (readingSnap.exists() && readingSnap.val()[today]) {
                    setText(readingSnap.val()[today]);
                    return;
                }

                const vocabs = vocabSnap.exists() ? vocabSnap.val() : [];
                const grammarLearnedIds = grammarSnap.exists() ? grammarSnap.val() : [];

                // console.log("VOCAB:", vocabs);
                // console.log("GRAMMAR IDS:", grammarLearnedIds);

                setLearnedVocab(vocabs);
                setLearnedGrammar(grammarLearnedIds);

                const grammarForApi = getGrammarForApi(grammarLearnedIds, grammar);

                // console.log("GRAMMAR SENT TO API:", grammarForApi);

                const newContent = await GenerateData(grammarForApi, vocabs);

                await set(ref(db, `ReadingGenerationDates/${today}`), newContent);
                await set(ref(db,`Result/${today}`),{"Reading":0,"Listening":"0"});
                

                setText(newContent);

            } catch (error) {
                console.error(error);
                setText("Failed to load reading content.");
            }
        };

        fetchReadingData();
    }, []);

    const AddSentence = (value) => {
        if (!value.trim()) return;
        setSentences(prev => [...prev, value]);
        console.log(Sentences);
    };

    const removeSentence = (id) => {
        setSentences(prevItems => prevItems.filter((_, index) => index !== id));
    };

    async function SubmitAnswer() {
        const response = await fetch("http://localhost:5000/api/grade-reading", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
            passage: text,         
            answers: Sentences
            })
        });

        if (!response.ok) {
            throw new Error("Backend error");
        }
        
        const today = getTodayDate();
        const resultRef = ref(db, `Result/${today}`);
        const consistencyRef = ref(db,`Consistency/${today}`)
        await update(resultRef, {Reading: 1});
        await runTransaction(consistencyRef, (currentValue) => {return (currentValue || 0) + 2;});


        return await response.json();
    }

    return(
        <div>
            <div className='ReadingBanner'>
                <img src={reading}></img>
                <p>Reading / よむ</p>
            </div>
            <div className='ReadingSection'>
                <div className='ReadingPassage'>
                    <p style={{fontFamily:"Shippori Antique"}}>きょうのぶんしょう</p>
                    <br></br>
                    <p className='OneLine'>{text}</p>
                </div>
                <div className='ReadingAnswer'>
                    <div className='Translation'>
                        <div className='TranscribeTab' onClick={()=>{setTab(0)}} style={{backgroundColor:tab === 0 ? "green" : "#E5E5E5",color:tab === 0 ? "white" : "black"}}><p>Translate</p></div>
                        <div className='AnswerUnlock' onClick={()=>{setTab(1)}} style={{backgroundColor:tab === 1 ? "green" : "#E5E5E5",color:tab === 1 ? "white" : "black"}}><p>Result</p></div>
                    </div>
                    <br></br>
                    {tab === 1 ? 
                        <div className='ResultCardsContainer'>
                            {results.results.map((r, i) => (
                                <div key={i} className='ResultCards'>
                                    <p style={{color:"#1f3a8a"}}>Japanese - {r.japanese}</p>
                                    <p style={{color:"#16a34a"}}>Correct: {r.correct_english}</p>
                                    <p style={{color:"#374151"}}>Your answer: {r.student_answer}</p>
                                    <p style={{color:r.correct ? "green" : "red",fontWeight:'500'}}>{r.correct ? "Correct" : "Incorrect"}</p>
                                </div>
                            ))}
                        </div> 
                        :
                        <>
                            {Sentences.map((sentence,index)=>(
                                <p key={index} className='OneLine' onClick={()=>{removeSentence(index)}}>{sentence}</p>
                            ))}
                            <br></br>
                            <div className='TranslationOption'>
                                <input type='text' className='TranslationText' placeholder='Enter Translation' onKeyDown={(e) => {if (e.key === "Enter"){AddSentence(e.target.value); e.target.value = "";}}}/>
                                <button onClick={handleSubmit}>Submit</button>
                            </div>
                        </>
                    }
                </div>
            </div>
        </div>
    )
};

export default Reading; 