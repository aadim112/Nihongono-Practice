import './Reading.css';
import grammar from './Grammar.json';
import reading from '../Assets/reading.png';
import db from './firebase';
import { ref,get, set,update,runTransaction } from 'firebase/database';
import { useState,useEffect } from 'react';

const Reading = ({user}) => {
    const [text,setText] = useState('Loading');
    const [LearnedGrammar,setLearnedGrammar] = useState([]);
    const [LearnedVocab,setLearnedVocab] = useState([]);
    const [questions, setQuestions] = useState([]);
    const [answers, setAnswers] = useState([]);
    const [tab,setTab] = useState(0);
    const [results, setResult] = useState({score: 0,results: []});


    const getTodayDate = () => {
        const today = new Date();
        return today.toISOString().split("T")[0];
    };

    async function GenerateData(grammar,vocab){
        const apiUrl = process.env.REACT_APP_API_URL || "http://localhost:5000";
        const response = await fetch(`${apiUrl}/api/generate-reading`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({grammar,vocab})
        });

        if (!response.ok) {
            throw new Error("Backend error");
        }

        const data = await response.json();
        return data;
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

                const readingRef = ref(db, `${user}/ReadingGenerationDates`);
                const resultRef = ref(db,`${user}/Result`);
                const vocabRef = ref(db, `${user}/vocab/words`);
                const grammarRef = ref(db, `${user}/grammar/GrammarLearned`);

                const [readingSnap, vocabSnap, grammarSnap] = await Promise.all([
                    get(readingRef),
                    get(vocabRef),
                    get(grammarRef),
                    get(resultRef),
                ]);

                if (readingSnap.exists() && readingSnap.val()[today]) {
                    const stored = readingSnap.val()[today];

                    // Backward compatibility: older data may be plain text (no questions)
                    if (typeof stored === "string") {
                        setText(stored);
                        setQuestions([]);
                        setAnswers([]);
                    } else {
                        setText(stored.passage || "Failed to load passage.");
                        const qs = Array.isArray(stored.questions) ? stored.questions : [];
                        setQuestions(qs);
                        setAnswers(qs.map(() => ""));
                    }
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

                await set(ref(db, `${user}/ReadingGenerationDates/${today}`), newContent);
                await set(ref(db,`${user}/Result/${today}`),{"Reading":0,"Listening":"0"});
                
                setText(newContent.passage || "Failed to load passage.");
                const qs = Array.isArray(newContent.questions) ? newContent.questions : [];
                setQuestions(qs);
                setAnswers(qs.map(() => ""));

            } catch (error) {
                console.error(error);
                setText("Failed to load reading content.");
            }
        };

        fetchReadingData();
    }, []);

    const handleAnswerChange = (index, value) => {
        setAnswers(prev => {
            const copy = [...prev];
            copy[index] = value;
            return copy;
        });
    };

    async function SubmitAnswer() {
        const apiUrl = process.env.REACT_APP_API_URL || "http://localhost:5000";
        const response = await fetch(`${apiUrl}/api/grade-reading-questions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
            passage: text,
            questions: questions,
            answers: answers
            })
        });

        if (!response.ok) {
            throw new Error("Backend error");
        }
        
        const today = getTodayDate();
        const resultRef = ref(db, `${user}/Result/${today}`);
        const consistencyRef = ref(db,`${user}/Consistency/${today}`)
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
                        <div className='TranscribeTab' onClick={()=>{setTab(0)}} style={{backgroundColor:tab === 0 ? "green" : "#E5E5E5",color:tab === 0 ? "white" : "black"}}><p>Questions</p></div>
                        <div className='AnswerUnlock' onClick={()=>{setTab(1)}} style={{backgroundColor:tab === 1 ? "green" : "#E5E5E5",color:tab === 1 ? "white" : "black"}}><p>Result</p></div>
                    </div>
                    <br></br>
                    {tab === 1 ? 
                        <div className='ResultCardsContainer'>
                            {results.results.map((r, i) => (
                                <div key={i} className='ResultCards'>
                                    <p style={{color:"#1f3a8a"}}>Q{i+1}: {r.question}</p>
                                    <p style={{color:"#16a34a"}}>Correct: {r.expected_answer}</p>
                                    <p style={{color:"#374151"}}>Your answer: {r.student_answer}</p>
                                    <p style={{color:r.correct ? "green" : "red",fontWeight:'500'}}>{r.correct ? "Correct" : "Incorrect"}</p>
                                    {r.feedback && <p style={{color:"#6b7280"}}>{r.feedback}</p>}
                                </div>
                            ))}
                        </div> 
                        :
                        <>
                            <div className='QuestionsContainer'>
                                {questions.length === 0 && (
                                    <p style={{color:"#6b7280"}}>No questions available for this passage.</p>
                                )}
                                {questions.map((q, index) => (
                                    <div key={q.id || index} className='QuestionItem'>
                                        <p style={{fontWeight:'600', marginBottom:'4px'}}>
                                            Q{index + 1}. {q.question_english || "Question"}
                                        </p>
                                        {q.question_japanese && (
                                            <p style={{fontFamily:"Shippori Antique", color:"#1f2937", marginBottom:'6px'}}>
                                                {q.question_japanese}
                                            </p>
                                        )}
                                        <input
                                            type='text'
                                            className='TranslationText'
                                            placeholder='Your answer (English or Japanese)'
                                            value={answers[index] || ""}
                                            onChange={(e) => handleAnswerChange(index, e.target.value)}
                                        />
                                    </div>
                                ))}
                            </div>
                            {questions.length > 0 && (
                                <div className='TranslationOption'>
                                    <button onClick={handleSubmit}>Submit Answers</button>
                                </div>
                            )}
                        </>
                    }
                </div>
            </div>
        </div>
    )
};

export default Reading; 