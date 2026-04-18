import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ref, get, set } from "firebase/database";
import db from './firebase';
import './YoutubePractice.css';

const YoutubePractice = ({ user }) => {
    const [url, setUrl] = useState('');
    const [videoId, setVideoId] = useState('');
    const [transcript, setTranscript] = useState([]);
    const [currentTime, setCurrentTime] = useState(0);
    const [activeLineIndex, setActiveLineIndex] = useState(-1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedWord, setSelectedWord] = useState(null);
    const [dictionaryData, setDictionaryData] = useState(null);
    const [loadingDictionary, setLoadingDictionary] = useState(false);
    const [addedStatus, setAddedStatus] = useState(false);

    const playerRef = useRef(null);   // holds the YT.Player instance
    const iframeContainerId = 'yt-player-container';
    const timeIntervalRef = useRef(null);

    const rawApiUrl = process.env.REACT_APP_API_URL || "http://localhost:5000";
    const apiUrl = rawApiUrl.endsWith('/') ? rawApiUrl.slice(0, -1) : rawApiUrl;

    // Extract video ID from any YouTube URL format
    const extractVideoId = (ytUrl) => {
        const patterns = [
            /(?:v=|\/)([\w-]{11})(?:\?|&|$)/,
            /youtu\.be\/([\w-]{11})/,
            /embed\/([\w-]{11})/,
        ];
        for (const pattern of patterns) {
            const match = ytUrl.match(pattern);
            if (match) return match[1];
        }
        return null;
    };

    // Initialize the YouTube IFrame Player after the iframe div is rendered
    const initPlayer = useCallback((vid) => {
        // Clean up previous player and interval
        if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
        if (playerRef.current && typeof playerRef.current.destroy === 'function') {
            playerRef.current.destroy();
        }

        const createPlayer = () => {
            playerRef.current = new window.YT.Player(iframeContainerId, {
                videoId: vid,
                playerVars: { autoplay: 0, controls: 1, rel: 0 },
                events: {
                    onReady: () => {
                        // Poll the current time every 500ms
                        timeIntervalRef.current = setInterval(() => {
                            if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
                                setCurrentTime(playerRef.current.getCurrentTime());
                            }
                        }, 500);
                    },
                },
            });
        };

        if (window.YT && window.YT.Player) {
            createPlayer();
        } else {
            // Load the IFrame API script if not already loaded
            if (!document.getElementById('yt-iframe-api')) {
                const script = document.createElement('script');
                script.id = 'yt-iframe-api';
                script.src = 'https://www.youtube.com/iframe_api';
                document.body.appendChild(script);
            }
            window.onYouTubeIframeAPIReady = createPlayer;
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
            if (playerRef.current && typeof playerRef.current.destroy === 'function') {
                playerRef.current.destroy();
            }
        };
    }, []);

    const loadVideo = async () => {
        if (!url) return;

        const vid = extractVideoId(url);
        if (!vid) {
            setError('Invalid YouTube URL. Please check the link and try again.');
            return;
        }

        setLoading(true);
        setError('');
        setTranscript([]);
        setActiveLineIndex(-1);
        setVideoId('');

        try {
            const response = await fetch(`${apiUrl}/api/youtube-transcript?url=${encodeURIComponent(url)}`);
            const data = await response.json();

            if (data.error) throw new Error(data.error);

            setTranscript(data.transcript);
            setVideoId(vid);
        } catch (err) {
            setError(err.message || 'Failed to load transcript');
        } finally {
            setLoading(false);
        }
    };

    // Init the player when videoId changes
    useEffect(() => {
        if (videoId) {
            // Small delay to ensure the div is rendered
            setTimeout(() => initPlayer(videoId), 100);
        }
    }, [videoId, initPlayer]);

    // Sync transcript to current time
    useEffect(() => {
        if (transcript.length === 0) return;

        const index = transcript.findIndex((line, i) => {
            const nextLine = transcript[i + 1];
            return currentTime >= line.start && (!nextLine || currentTime < nextLine.start);
        });

        if (index !== -1 && index !== activeLineIndex) {
            setActiveLineIndex(index);
        }
    }, [currentTime, transcript, activeLineIndex]);

    const handleWordClick = async (token) => {
        setSelectedWord(token);
        setLoadingDictionary(true);
        setDictionaryData(null);
        setAddedStatus(false);

        try {
            const wordToSearch = token.base || token.surface;
            const response = await fetch(`${apiUrl}/api/jisho-proxy?keyword=${encodeURIComponent(wordToSearch)}`);
            const data = await response.json();

            if (data.data && data.data.length > 0) {
                setDictionaryData(data.data[0]);
            } else {
                setDictionaryData({ error: 'No definition found' });
            }
        } catch (err) {
            console.error('Dictionary error:', err);
        } finally {
            setLoadingDictionary(false);
        }
    };

    const addToVocab = async () => {
        if (!dictionaryData || !selectedWord) return;

        try {
            const vocabRef = ref(db, `${user}/vocab`);
            const snapshot = await get(vocabRef);
            const existing = snapshot.exists() ? snapshot.val() : {};

            // Firebase stores arrays as objects with numeric keys — normalise
            const existingWordsRaw = existing.words;
            const existingWords = Array.isArray(existingWordsRaw)
                ? existingWordsRaw
                : existingWordsRaw && typeof existingWordsRaw === 'object'
                    ? Object.values(existingWordsRaw)
                    : [];

            const newWord = {
                word: selectedWord.surface,
                kanji: dictionaryData.japanese?.[0]?.word || selectedWord.surface,
                meaning: dictionaryData.senses?.[0]?.english_definitions?.join('; ') || 'No definition found'
            };

            const isDuplicate = existingWords.some(
                w => w.word === newWord.word && w.kanji === newWord.kanji
            );
            if (isDuplicate) {
                alert('This word is already in your vocab list!');
                return;
            }

            const updatedWords = [...existingWords, newWord];

            // Write the full vocab object using set() to avoid array-merge issues
            await set(vocabRef, {
                ...existing,
                words: updatedWords,
                totalCount: updatedWords.length,
            });

            setAddedStatus(true);
            setTimeout(() => setAddedStatus(false), 2000);
        } catch (err) {
            console.error('Failed to save vocab:', err);
            alert(`Failed to add to vocab: ${err.message}`);
        }
    };

    const activeLine = transcript[activeLineIndex];

    return (
        <div className="YoutubePracticeContainer">
            <div className="YoutubeHeader">
                <input
                    type="text"
                    className="YoutubeUrlInput"
                    placeholder="Paste YouTube Video URL here..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && loadVideo()}
                />
                <button className="LoadVideoButton" onClick={loadVideo} disabled={loading}>
                    {loading ? 'Loading...' : 'Load Video'}
                </button>
            </div>

            {error && (
                <div style={{ color: '#ef4444', marginBottom: '15px', padding: '10px', background: '#fee2e2', borderRadius: '8px' }}>
                    {error}
                </div>
            )}

            <div className="YoutubeMainLayout">
                <div className="VideoWrapper">
                    {videoId ? (
                        /* The YT IFrame API replaces this div with an iframe */
                        <div id={iframeContainerId} style={{ width: '100%', height: '100%' }} />
                    ) : (
                        <div className="EmptyState">
                            <span className="icon">📺</span>
                            <p>Paste a YouTube URL above to start</p>
                            <p style={{ fontSize: '14px' }}>Works best with Japanese videos that have captions</p>
                        </div>
                    )}
                </div>

                <div className="TranscriptSidebar">
                    <div className="TranscriptHeader">
                        <h2>Transcript / スクリプト</h2>
                    </div>
                    <div className="TranscriptContent subtitle-mode">
                        {transcript.length > 0 ? (
                            activeLine ? (
                                <div className="TranscriptLine active subtitle-display">
                                    <div className="JapaneseText subtitle-text">
                                        {activeLine.tokens.map((token, tIdx) => (
                                            <span
                                                key={tIdx}
                                                className="Token"
                                                onClick={() => handleWordClick(token)}
                                            >
                                                {token.surface}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="EnglishTranslation subtitle-translation">
                                        {activeLine.translation || '　'}
                                    </div>
                                </div>
                            ) : (
                                <div className="EmptyState">
                                    <p style={{ color: '#94a3b8' }}>▶ Play the video to see the transcript</p>
                                </div>
                            )
                        ) : (
                            <div className="EmptyState">
                                <span className="icon">📝</span>
                                <p>Transcript will appear here</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {selectedWord && (
                <>
                    <div className="PopupOverlay" onClick={() => setSelectedWord(null)} />
                    <div className="DictionaryPopup">
                        <div className="PopupHeader">
                            <div className="WordInfo">
                                <h2>{selectedWord.surface}</h2>
                                {dictionaryData && !dictionaryData.error && (
                                    <div className="WordReading">
                                        {dictionaryData.japanese?.[0]?.reading}
                                        {dictionaryData.japanese?.[0]?.word !== selectedWord.surface &&
                                            ` (${dictionaryData.japanese?.[0]?.word})`}
                                    </div>
                                )}
                            </div>
                            <button className="ClosePopup" onClick={() => setSelectedWord(null)}>×</button>
                        </div>

                        <div className="WordMeaning">
                            {loadingDictionary ? (
                                <div style={{ textAlign: 'center', padding: '20px' }}>Looking up...</div>
                            ) : dictionaryData?.error ? (
                                <div style={{ color: '#ef4444' }}>{dictionaryData.error}</div>
                            ) : (
                                <div>
                                    <p><strong>Meaning:</strong></p>
                                    <p>{dictionaryData?.senses?.[0]?.english_definitions?.join(', ')}</p>
                                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '10px' }}>
                                        {dictionaryData?.senses?.[0]?.parts_of_speech?.join(', ')}
                                    </p>
                                </div>
                            )}
                        </div>

                        {dictionaryData && !dictionaryData.error && !loadingDictionary && (
                            <button
                                className={`AddToVocabBtn ${addedStatus ? 'success' : ''}`}
                                onClick={addToVocab}
                                disabled={addedStatus}
                            >
                                {addedStatus ? '✓ Added to Vocab' : '+ Add to Vocab List'}
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default YoutubePractice;
