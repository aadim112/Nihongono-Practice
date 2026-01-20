import './Listening.css'
import Listen from '../Assets/listening.png'
import grammar from './Grammar.json';
import db from './firebase';
import { ref, get } from 'firebase/database';
import { useRef, useState, useEffect } from 'react';

const Listening = () => {
    const audioRef = useRef(null);
    const messagesEndRef = useRef(null);
    const [playing, setPlaying] = useState(false);
    const [hint, setHint] = useState('');
    const [userInput, setUserInput] = useState('');
    const [conversationStarted, setConversationStarted] = useState(false);
    const [loading, setLoading] = useState(false);
    const [currentExchangeIndex, setCurrentExchangeIndex] = useState(0);
    const [conversationData, setConversationData] = useState(null);
    const [messages, setMessages] = useState([]);
    const [currentAudioBase64, setCurrentAudioBase64] = useState('');
    const [waitingForUserResponse, setWaitingForUserResponse] = useState(false);
    const [conversationComplete, setConversationComplete] = useState(false);
    
    const [learnedGrammar, setLearnedGrammar] = useState([]);
    const [learnedVocab, setLearnedVocab] = useState([]);
    const [grammarForApi, setGrammarForApi] = useState([]);
    const [dataLoaded, setDataLoaded] = useState(false);
    
    // Romaji to Hiragana conversion
    const [romanjiBuffer, setRomanjiBuffer] = useState('');

    const numExchanges = 5; // Number of conversation exchanges

    // Romaji to Hiragana mapping
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
            // Handle small tsu (double consonants)
            if (
                i + 1 < text.length &&
                text[i] === text[i + 1] &&
                'bcdfghjklmpqrstvwxyz'.includes(text[i].toLowerCase())
            ) {
                result += 'っ';
                i += 1;
                continue;
            }
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

    // Fetch grammar and vocab from Firebase on mount
    useEffect(() => {
        const fetchData = async () => {
            try {
                const vocabRef = ref(db, "vocab/words");
                const grammarRef = ref(db, "grammar/GrammarLearned");

                const [vocabSnap, grammarSnap] = await Promise.all([
                    get(vocabRef),
                    get(grammarRef)
                ]);

                const vocabs = vocabSnap.exists() ? vocabSnap.val() : [];
                const grammarLearnedIds = grammarSnap.exists() ? grammarSnap.val() : [];

                const vocabStrings = Array.isArray(vocabs)? vocabs.map(v => v.word): [];

                setLearnedVocab(vocabStrings);
                setLearnedGrammar(grammarLearnedIds);

                // Convert grammar IDs to API format
                const grammarForApiData = getGrammarForApi(grammarLearnedIds, grammar);
                setGrammarForApi(grammarForApiData);
                setDataLoaded(true);

                console.log("Loaded Vocab:", vocabs);
                console.log("Loaded Grammar:", grammarForApiData);

            } catch (error) {
                console.error("Error loading grammar/vocab:", error);
                // Set defaults if loading fails
                setGrammarForApi([
                    { pattern: "〜です", meaning: "to be" },
                    { pattern: "〜ます", meaning: "polite verb ending" }
                ]);
                setLearnedVocab(["こんにちは", "ありがとう", "おはよう"]);
                setDataLoaded(true);
            }
        };

        fetchData();
    }, []);

    // Helper function to convert grammar IDs to API format
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

    // Scroll to bottom when messages change
    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const toggleAudio = () => {
        if (!audioRef.current) return;

        if (playing) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        } else {
            audioRef.current.play();
        }

        setPlaying(!playing);
    };

    const startConversation = async () => {
        if (!dataLoaded) {
            alert('Loading grammar and vocabulary data...');
            return;
        }

        if (grammarForApi.length === 0) {
            alert('No grammar patterns learned yet. Please learn some grammar first!');
            return;
        }

        setLoading(true);
        setMessages([]);
        setConversationStarted(true);
        setCurrentExchangeIndex(0);
        setConversationComplete(false);

        try {
            // Get conversation data from backend using Firebase data
            const response = await fetch('http://localhost:5000/api/start-conversation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    grammar: grammarForApi,
                    vocab: learnedVocab,
                    num_exchanges: numExchanges
                })
            });

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            console.log(data);
            setConversationData(data);
            
            await loadExchange(data.exchanges[0], 0);
            
        } catch (error) {
            console.error('Error starting conversation:', error);
            alert('Failed to start conversation: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const loadExchange = async (exchange, index) => {
        try {
            // Generate audio for Japanese text
            const audioResponse = await fetch('http://localhost:5000/api/generate-audio', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: exchange.japanese
                })
            });

            const audioData = await audioResponse.json();
            
            if (audioData.error) {
                throw new Error(audioData.error);
            }

            setCurrentAudioBase64(audioData.audio);

            // Add audio message to chat
            setMessages(prev => [...prev, {
                type: 'audio',
                japanese: exchange.japanese,
                english: exchange.english,
                options: exchange.options,
                correctIndex: exchange.correct_option_index,
                audioBase64: audioData.audio,
                exchangeIndex: index
            }]);

        } catch (error) {
            console.error('Error loading exchange:', error);
            alert('Failed to load audio: ' + error.message);
        }
    };

    const handleOptionClick = (message, optionIndex, option) => {
        // Check if this specific message already has a selection
        if (message.selectedOption !== undefined && message.selectedOption !== null) return;

        const isCorrect = optionIndex === message.correctIndex;

        // Update message to show selected option
        setMessages(prev => prev.map((msg) => 
            msg.exchangeIndex === message.exchangeIndex 
                ? { ...msg, selectedOption: optionIndex, optionCorrect: isCorrect }
                : msg
        ));

        if (isCorrect) {
            // Show hint for user response
            setTimeout(() => {
                const currentExchange = conversationData.exchanges[currentExchangeIndex];
                setHint(currentExchange.expected_response_english);
                setWaitingForUserResponse(true);
            }, 500);
        } else {
            // Wrong answer - allow retry after delay
            setTimeout(() => {
                setMessages(prev => prev.map((msg) => 
                    msg.exchangeIndex === message.exchangeIndex 
                        ? { ...msg, selectedOption: null, optionCorrect: null }
                        : msg
                ));
            }, 1500);
        }
    };

    const handleSendMessage = async () => {
        if (!userInput.trim() || !waitingForUserResponse) return;

        const currentExchange = conversationData.exchanges[currentExchangeIndex];
        
        // Add user message to chat
        const userMessage = {
            type: 'user',
            text: userInput,
            exchangeIndex: currentExchangeIndex
        };
        
        setMessages(prev => [...prev, userMessage]);
        
        setLoading(true);

        try {
            const response = await fetch('http://localhost:5000/api/check-answer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    student_answer: userInput,
                    expected_japanese: currentExchange.expected_response_japanese,
                    expected_english: currentExchange.expected_response_english
                })
            });

            const result = await response.json();
            
            if (result.error) {
                throw new Error(result.error);
            }
            setMessages(prev => prev.map((msg, idx) => 
                idx === prev.length - 1 
                    ? { ...msg, correct: result.correct, feedback: result.feedback }
                    : msg
            ));

            if (result.correct) {
                setTimeout(() => {
                    const nextIndex = currentExchangeIndex + 1;
                    
                    if (nextIndex < conversationData.exchanges.length) {
                        setCurrentExchangeIndex(nextIndex);
                        loadExchange(conversationData.exchanges[nextIndex], nextIndex);
                        setHint('');
                        setUserInput('');
                        setWaitingForUserResponse(false);
                    } else {
                        setConversationComplete(true);
                        setHint('');
                        setUserInput('');
                        setWaitingForUserResponse(false);
                        
                        setMessages(prev => [...prev, {
                            type: 'system',
                            text: '会話が終わりました！ Conversation completed! Great job! 🎉'
                        }]);
                    }
                }, 1000);
            } else {
                setUserInput('');
            }

        } catch (error) {
            console.error('Error checking answer:', error);
            alert('Failed to check answer: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleSendMessage();
        }
    };

    const handleInputChange = (e) => {
        const input = e.target.value;
        const hiragana = convertToHiragana(input, true);
        setUserInput(hiragana);
    };

    return (
        <>
            <div className='ListeningBanner'>
                <img src={Listen} alt="Listening" />
                <p>Listening / きく</p>
            </div>
            <div className='ListeningChatBot'>
                <div className='ChatNavbar'>
                    <div className={conversationStarted ? 'status active' : 'status'}></div>
                    <p>Japanese Speaker</p>
                    {!dataLoaded && (
                        <p style={{ fontSize: '12px', marginLeft: '10px', color: '#fff' }}>
                            Loading data...
                        </p>
                    )}
                    <div className='ConvoButton' onClick={startConversation}
                        style={{ 
                            opacity: loading || !dataLoaded ? 0.5 : 1,
                            cursor: loading || !dataLoaded ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {loading ? 'Loading...' : conversationStarted ? 'Restart' : 'Start'}
                    </div>
                </div>
                <div className='Messages'>
                    {!dataLoaded && (
                        <div style={{ 
                            textAlign: 'center', 
                            padding: '20px',
                            fontFamily: 'poppins',
                            color: '#666'
                        }}>
                            Loading your learned grammar and vocabulary...
                        </div>
                    )}
                    {dataLoaded && messages.length === 0 && !conversationStarted && (
                        <div style={{ 
                            textAlign: 'center', 
                            padding: '20px',
                            fontFamily: 'poppins',
                            color: '#666'
                        }}>
                            Click "Start" to begin the conversation!
                            <br />
                            <span style={{ fontSize: '12px' }}>
                                Using {grammarForApi.length} grammar patterns and {learnedVocab.length} vocabulary words
                            </span>
                        </div>
                    )}
                    {messages.map((message, idx) => (
                        <div key={idx}>
                            {message.type === 'audio' && (
                                <div>
                                    <div className='AudioDiv'>
                                        <button 
                                            className="audio-btn" 
                                            onClick={() => {
                                                const audio = new Audio(`data:audio/mpeg;base64,${message.audioBase64}`);
                                                // audio.playbackRate = 0.75;
                                                audio.play();
                                            }}
                                        >
                                            ▶
                                        </button>
                                        <span className="audio-name">Japanese Audio {idx + 1}</span>
                                    </div>
                                    <div className='OptionsContainer'>
                                        {message.options.map((option, optIdx) => (
                                            <div 
                                                key={optIdx}
                                                className='AnswerOptions'
                                                onClick={() => handleOptionClick(message, optIdx, option)}
                                                style={{
                                                    backgroundColor: message.selectedOption === optIdx 
                                                        ? (message.optionCorrect ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)')
                                                        : 'rgba(255, 255, 255, 0.241)',
                                                    cursor: message.selectedOption !== null ? 'not-allowed' : 'pointer'
                                                }}
                                            >
                                                <p>{option}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {message.type === 'user' && (
                                <div className='UserAnswer'>
                                    <div className='Answer'
                                        style={{ backgroundColor: message.correct === true ? '#90EE90' : message.correct === false ? '#FFB6C6' : 'white'}}>
                                        <p>{message.text}</p>
                                        {message.feedback && (
                                            <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                                                {message.feedback}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                            {message.type === 'system' && (
                                <div style={{ textAlign: 'center', padding: '20px',fontFamily: 'poppins',fontSize: '18px',color: 'green',fontWeight: 'bold'}}>
                                    {message.text}
                                </div>
                            )}
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
                <div className='KeyBoard'>
                    <div className='InputFiled'>
                        {hint && 
                            <div className='HintContainer'>
                                <div className='Hint'>
                                    Type in Japanese: {hint}
                                </div>
                            </div>
                        }
                        <input type='text' placeholder='Type in romaji (e.g., konnichiwa → こんにちは)' value={userInput} onChange={handleInputChange} onKeyPress={handleKeyPress} disabled={!waitingForUserResponse || loading}/>
                    </div>
                    <div className='Send' onClick={handleSendMessage}
                        style={{ 
                            cursor: waitingForUserResponse && !loading ? 'pointer' : 'not-allowed',
                            opacity: waitingForUserResponse && !loading ? 1 : 0.5
                        }}>
                        <span style={{ color: 'white', fontSize: '24px',lineHeight: '50px',display: 'block',textAlign: 'center'}}>➤</span>
                    </div>
                </div>
            </div>
        </>
    );
};

export default Listening;