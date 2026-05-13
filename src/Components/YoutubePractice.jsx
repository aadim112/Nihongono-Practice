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

    const playerRef = useRef(null);
    const iframeContainerId = 'yt-player-container';
    const timeIntervalRef = useRef(null);
    const activeLineRef = useRef(null);   // ref attached to the active transcript line

    const rawApiUrl = process.env.REACT_APP_API_URL || "http://localhost:5000";
    const apiUrl = rawApiUrl.endsWith('/') ? rawApiUrl.slice(0, -1) : rawApiUrl;

    // Extract video ID from any YouTube URL format
    const extractVideoId = (ytUrl) => {
        const patterns = [
            /(?:v=|\/)([\\w-]{11})(?:\?|&|$)/,
            /youtu\.be\/([\w-]{11})/,
            /embed\/([\w-]{11})/,
        ];
        for (const pattern of patterns) {
            const match = ytUrl.match(pattern);
            if (match) return match[1];
        }
        return null;
    };

    // Initialize the YouTube IFrame Player
    const initPlayer = useCallback((vid) => {
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

    // Auto-scroll active line into view
    useEffect(() => {
        if (activeLineRef.current) {
            activeLineRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
        }
    }, [activeLineIndex]);

    const handleWordClick = async (token) => {
        // Ignore punctuation / symbols
        if (token.pos === '記号' || token.surface.trim() === '') return;

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
            setDictionaryData({ error: 'Failed to look up word' });
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

    /**
     * Renders a single transcript token.
     * - Kanji tokens (reading !== surface) → <ruby> with <rt> furigana
     * - All others → plain <span>
     * Both are clickable (except punctuation).
     */
    const renderToken = (token, tIdx) => {
        const isPunctuation = token.pos === '記号' || /^[。、！？…・「」『』【】〜ー\s]+$/.test(token.surface);
        const hasReading = token.reading && token.reading !== token.surface;

        if (hasReading) {
            return (
                <ruby
                    key={tIdx}
                    className={`Token KanjiToken${isPunctuation ? ' Punctuation' : ''}`}
                    onClick={!isPunctuation ? () => handleWordClick(token) : undefined}
                    title={!isPunctuation ? token.reading : undefined}
                >
                    {token.surface}
                    <rt>{token.reading}</rt>
                </ruby>
            );
        }

        return (
            <span
                key={tIdx}
                className={`Token${isPunctuation ? ' Punctuation' : ''}`}
                onClick={!isPunctuation ? () => handleWordClick(token) : undefined}
            >
                {token.surface}
            </span>
        );
    };

    return (
        <div className="YoutubePracticeContainer">
            {/* ── URL Input Bar ── */}
            <div className="YoutubeHeader">
                <input
                    type="text"
                    className="YoutubeUrlInput"
                    placeholder="Paste YouTube Video URL here…"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && loadVideo()}
                />
                <button className="LoadVideoButton" onClick={loadVideo} disabled={loading}>
                    {loading ? (
                        <span className="LoadingSpinner">⟳ Loading…</span>
                    ) : (
                        '▶ Load Video'
                    )}
                </button>
            </div>

            {error && (
                <div className="ErrorBanner">{error}</div>
            )}

            {/* ── Main Layout ── */}
            <div className="YoutubeMainLayout">
                {/* Left — Video Player */}
                <div className="VideoWrapper">
                    {videoId ? (
                        <div id={iframeContainerId} style={{ width: '100%', height: '100%' }} />
                    ) : (
                        <div className="EmptyState">
                            <span className="icon">📺</span>
                            <p>Paste a YouTube URL above to start</p>
                            <p className="EmptySubtext">Works best with Japanese videos that have captions</p>
                        </div>
                    )}
                </div>

                {/* Right — Transcript Panel */}
                <div className="TranscriptSidebar">
                    <div className="TranscriptHeader">
                        <h2>スクリプト <span className="TranscriptSubtitle">Transcript</span></h2>
                        {transcript.length > 0 && (
                            <span className="TranscriptCount">{transcript.length} lines</span>
                        )}
                    </div>

                    <div className="TranscriptContent">
                        {transcript.length > 0 ? (
                            <div className="TranscriptList">
                                {transcript.map((line, lineIdx) => {
                                    const isActive = lineIdx === activeLineIndex;
                                    return (
                                        <div
                                            key={lineIdx}
                                            ref={isActive ? activeLineRef : null}
                                            className={`TranscriptLine${isActive ? ' active' : ''}`}
                                            onClick={() => {
                                                // Clicking a line seeks the video to that timestamp
                                                if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
                                                    playerRef.current.seekTo(line.start, true);
                                                    playerRef.current.playVideo();
                                                }
                                            }}
                                        >
                                            {/* Timestamp badge */}
                                            <span className="TimeStamp">
                                                {Math.floor(line.start / 60)}:{String(Math.floor(line.start % 60)).padStart(2, '0')}
                                            </span>

                                            {/* Japanese text with furigana */}
                                            <div className="JapaneseText">
                                                {line.tokens.map((token, tIdx) => renderToken(token, tIdx))}
                                            </div>

                                            {/* English translation */}
                                            {line.translation && line.translation.trim() !== '' && (
                                                <div className="EnglishTranslation">
                                                    {line.translation}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="EmptyState">
                                {loading ? (
                                    <>
                                        <span className="icon LoadingIcon">⟳</span>
                                        <p>Fetching transcript…</p>
                                    </>
                                ) : (
                                    <>
                                        <span className="icon">📝</span>
                                        <p>Transcript will appear here</p>
                                        <p className="EmptySubtext">Load a video to get started</p>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Dictionary Popup ── */}
            {selectedWord && (
                <>
                    <div className="PopupOverlay" onClick={() => setSelectedWord(null)} />
                    <div className="DictionaryPopup">
                        <div className="PopupHeader">
                            <div className="WordInfo">
                                <h2 className="PopupWord">{selectedWord.surface}</h2>
                                {selectedWord.reading && selectedWord.reading !== selectedWord.surface && (
                                    <div className="PopupReading">
                                        {selectedWord.reading}
                                    </div>
                                )}
                                {dictionaryData && !dictionaryData.error && (
                                    <div className="WordReading">
                                        {dictionaryData.japanese?.[0]?.reading &&
                                            dictionaryData.japanese[0].reading !== selectedWord.surface &&
                                            <span>{dictionaryData.japanese[0].reading}</span>
                                        }
                                        {dictionaryData.japanese?.[0]?.word &&
                                            dictionaryData.japanese[0].word !== selectedWord.surface &&
                                            <span className="KanjiForm"> {dictionaryData.japanese[0].word}</span>
                                        }
                                    </div>
                                )}
                            </div>
                            <button className="ClosePopup" onClick={() => setSelectedWord(null)}>×</button>
                        </div>

                        <div className="WordMeaning">
                            {loadingDictionary ? (
                                <div className="LookupSpinner">Looking up…</div>
                            ) : dictionaryData?.error ? (
                                <div className="LookupError">{dictionaryData.error}</div>
                            ) : (
                                <div>
                                    {dictionaryData?.senses?.slice(0, 3).map((sense, sIdx) => (
                                        <div key={sIdx} className="SenseRow">
                                            <span className="SenseNum">{sIdx + 1}.</span>
                                            <div className="SenseDetail">
                                                <p className="SenseMeaning">{sense.english_definitions?.join(', ')}</p>
                                                {sense.parts_of_speech?.length > 0 && (
                                                    <p className="SensePos">{sense.parts_of_speech.join(', ')}</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
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
