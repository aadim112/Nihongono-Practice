import './Reading.css';
import grammar from './Grammar.json';
import reading from '../Assets/reading.png';
import db from './firebase';
import { ref,get, set,update,runTransaction } from 'firebase/database';
import { useState,useEffect } from 'react';

const Reading = ({user}) => {
    const [text,setText] = useState('Loading');
    const [passageTokens, setPassageTokens] = useState([]);
    const [questions, setQuestions] = useState([]);
    const [answers, setAnswers] = useState([]);
    const [tab,setTab] = useState(0);
    const [results, setResult] = useState({score: 0,results: []});

    /**
     * Recency-weighted reservoir sample of vocab words.
     * Words near the END of the array (added most recently) get a higher weight
     * so they appear more often in generated passages for active reinforcement.
     * @param {Array}  vocabArray  - full vocab list from Firebase
     * @param {number} k           - number of words to pick (default 25)
     * @returns {Array}            - sampled subset
     */
    function sampleVocab(vocabArray, k = 25) {
        if (!Array.isArray(vocabArray) || vocabArray.length === 0) return [];
        if (vocabArray.length <= k) return [...vocabArray];

        // Assign a weight proportional to position (index+1) so recent words win more often
        const weights = vocabArray.map((_, i) => i + 1);   // 1, 2, 3, …, n
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);

        const chosen = [];
        const available = [...vocabArray.keys()];           // [0, 1, 2, …, n-1]
        let remainingWeight = totalWeight;

        for (let pick = 0; pick < k && available.length > 0; pick++) {
            let threshold = Math.random() * remainingWeight;
            for (let j = 0; j < available.length; j++) {
                threshold -= weights[available[j]];
                if (threshold <= 0) {
                    chosen.push(vocabArray[available[j]]);
                    remainingWeight -= weights[available[j]];
                    available.splice(j, 1);
                    break;
                }
            }
        }
        return chosen;
    }

    /**
     * Simple random sample (no replacement) of grammar patterns.
     * @param {Array}  grammarArray - full array of {pattern, meaning} objects
     * @param {number} k            - number of patterns to pick (default 7)
     * @returns {Array}             - sampled subset
     */
    function sampleGrammar(grammarArray, k = 7) {
        if (!Array.isArray(grammarArray) || grammarArray.length === 0) return [];
        if (grammarArray.length <= k) return [...grammarArray];

        const shuffled = [...grammarArray].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, k);
    }


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

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        const confirmed = window.confirm("Do you really want to submit?");
        if (!confirmed) return;

        setIsSubmitting(true);
        try {
            const data = await SubmitAnswer();
            setResult(data);
            setTab(1); 
        } catch (err) {
            console.error(err);
            alert("An error occurred while submitting. Please try again.");
        } finally {
            setIsSubmitting(false);
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
                        setPassageTokens([]);
                        setQuestions([]);
                        setAnswers([]);
                    } else {
                        setText(stored.passage || "Failed to load passage.");
                        setPassageTokens(stored.passage_tokens || []);
                        const qs = Array.isArray(stored.questions) ? stored.questions : [];
                        setQuestions(qs);
                        setAnswers(qs.map(() => ""));
                    }
                    return;
                }

                const vocabs = vocabSnap.exists() ? vocabSnap.val() : [];
                const grammarLearnedIds = grammarSnap.exists() ? grammarSnap.val() : [];

                const grammarForApi = getGrammarForApi(grammarLearnedIds, grammar);

                // --- Smart sampling: only send a subset to the LLM ---
                // This reduces token usage by 70-85% without losing passage quality.
                // A 20-25 sentence passage can only naturally use ~7 grammar patterns
                // and ~25 vocab words, so sending more is wasteful.
                const sampledGrammar = sampleGrammar(grammarForApi, 7);
                const sampledVocab = sampleVocab(vocabs, 25);

                console.log(
                    `[Reading] Sampled ${sampledGrammar.length}/${grammarForApi.length} grammar patterns,`,
                    `${sampledVocab.length}/${vocabs.length} vocab words for generation.`
                );

                const newContent = await GenerateData(sampledGrammar, sampledVocab);

                await set(ref(db, `${user}/ReadingGenerationDates/${today}`), newContent);
                await set(ref(db,`${user}/Result/${today}`),{"Reading":0,"Listening":"0"});
                
                setText(newContent.passage || "Failed to load passage.");
                setPassageTokens(newContent.passage_tokens || []);
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
                <img src={reading} alt="Reading section banner"></img>
                <p>Reading / よむ</p>
            </div>
            <div className='ReadingSection'>
                <div className='ReadingPassage'>
                    <p style={{fontFamily:"Shippori Antique"}}>きょうのぶんしょう</p>
                    <br></br>
                    <p className='OneLine'>
                        {passageTokens.length > 0 ? (
                            passageTokens.map((token, tIdx) => {
                                const hasReading = token.reading && token.reading !== token.surface && token.pos === '名詞';
                                if (hasReading) {
                                    return (
                                        <ruby key={tIdx} style={{ margin: '0 2px' }}>
                                            {token.surface}
                                            <rt style={{ color: '#6b7280', fontSize: '0.6em' }}>{token.reading}</rt>
                                        </ruby>
                                    );
                                }
                                return <span key={tIdx}>{token.surface}</span>;
                            })
                        ) : (
                            text
                        )}
                    </p>
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
                                    <button 
                                        onClick={handleSubmit} 
                                        disabled={isSubmitting}
                                        style={{ opacity: isSubmitting ? 0.7 : 1, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
                                    >
                                        {isSubmitting ? 'Submitting... ⏳' : 'Submit Answers'}
                                    </button>
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