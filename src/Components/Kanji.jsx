import './Kanji.css';
import { useState, useEffect } from 'react';
import { ref, onValue } from "firebase/database";
import db from './firebase';
import kanjis from './Kanjis.json';

const Kanji = ({ user }) => {
    const [kanjiData, setKanjiData] = useState({});
    const [kanjiList, setKanjiList] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [showVocab, setShowVocab] = useState(false);
    const [stats, setStats] = useState({ total: 0, studied: 0 });
    const [selectedDifficulty, setSelectedDifficulty] = useState(null);

    // Get kanji meanings from Kanjis.json
    const getKanjiMeaning = (kanji) => {
        for (let levelObj of kanjis) {
            for (let level in levelObj) {
                const found = levelObj[level].find(k => Object.keys(k)[0] === kanji);
                if (found) {
                    return {
                        meaning: Object.values(found)[0],
                        level: level
                    };
                }
            }
        }
        return { meaning: 'Unknown', level: 'N/A' };
    };

    // Fetch kanji data from Firebase
    useEffect(() => {
        const kanjiRef = ref(db, `${user}/kanji`);
        
        const unsubscribe = onValue(kanjiRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                setKanjiData(data);
                
                // Convert to array for easier navigation
                const list = Object.keys(data).map(kanji => ({
                    kanji,
                    vocabs: data[kanji],
                    ...getKanjiMeaning(kanji)
                }));
                
                setKanjiList(list);
                setStats({
                    total: list.length,
                    studied: 0
                });
            }
        });

        return () => unsubscribe();
    }, [user]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyPress = (e) => {
            if (e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                handleFlip();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                prevCard();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                nextCard();
            } else if (isFlipped) {
                if (e.key === '1') handleDifficulty('hard');
                else if (e.key === '2') handleDifficulty('good');
                else if (e.key === '3') handleDifficulty('easy');
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [isFlipped, currentIndex, kanjiList.length]);

    // Navigate cards
    const nextCard = () => {
        setIsFlipped(false);
        setShowVocab(false);
        setSelectedDifficulty(null);
        setCurrentIndex((prev) => (prev + 1) % kanjiList.length);
    };

    const prevCard = () => {
        setIsFlipped(false);
        setShowVocab(false);
        setSelectedDifficulty(null);
        setCurrentIndex((prev) => (prev - 1 + kanjiList.length) % kanjiList.length);
    };

    const handleFlip = () => {
        setIsFlipped(!isFlipped);
        if (!isFlipped) {
            setTimeout(() => setShowVocab(true), 300);
        } else {
            setShowVocab(false);
        }
    };

    const handleDifficulty = (difficulty) => {
        setSelectedDifficulty(difficulty);
        setTimeout(() => {
            nextCard();
        }, 500);
    };

    if (kanjiList.length === 0) {
        return (
            <div className="kanji-container">
                <div className="empty-state">
                    <div className="empty-icon">📚</div>
                    <h2>No Kanji Yet</h2>
                    <p>Start adding vocabulary to see kanji cards here!</p>
                </div>
            </div>
        );
    }

    const currentKanji = kanjiList[currentIndex];

    return (
        <div className="kanji-container">
            <div className="kanji-header">
                <div className="header-content">
                    <h1 className="title">Kanji Practice</h1>
                    <div className="stats">
                        <span className="stat-item">
                            <span className="stat-value">{currentIndex + 1}</span>
                            <span className="stat-label">/ {stats.total}</span>
                        </span>
                        <span className="level-badge">{currentKanji.level}</span>
                    </div>
                </div>
                <div className="progress-bar">
                    <div 
                        className="progress-fill" 
                        style={{ width: `${((currentIndex + 1) / stats.total) * 100}%` }}
                    />
                </div>
            </div>

            <div className="card-section">
                <div className={`flashcard ${isFlipped ? 'flipped' : ''}`} onClick={handleFlip}>
                    <div className="card-inner">
                        <div className="card-face card-front">
                            <div className="kanji-display">
                                <div className="kanji-character">{currentKanji.kanji}</div>
                                <div className="tap-hint">Tap to reveal</div>
                            </div>
                        </div>

                        {/* Back of card */}
                        <div className="card-face card-back">
                            <div className="kanji-info">
                                <div className="kanji-character-small">{currentKanji.kanji}</div>
                                <div className="kanji-meaning">{currentKanji.meaning}</div>
                            </div>
                            
                            {showVocab && (
                                <div className="vocab-section">
                                    <h3 className="vocab-title">Vocabulary ({currentKanji.vocabs.length})</h3>
                                    <div className="vocab-list">
                                        {currentKanji.vocabs.map((vocab, idx) => (
                                            <div key={idx} className="vocab-item">
                                                <div className="vocab-kanji">{vocab.kanji}</div>
                                                <div className="vocab-details">
                                                    <span className="vocab-reading">{vocab.word}</span>
                                                    <span className="vocab-meaning">{vocab.meaning}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                {isFlipped && (
                    <div className="difficulty-buttons">
                        <button 
                            className={`difficulty-btn hard ${selectedDifficulty === 'hard' ? 'selected' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDifficulty('hard');
                            }}
                        >
                            <span className="btn-text">Hard</span>
                        </button>
                        <button 
                            className={`difficulty-btn good ${selectedDifficulty === 'good' ? 'selected' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDifficulty('good');
                            }}
                        >
                            <span className="btn-text">Good</span>
                        </button>
                        <button 
                            className={`difficulty-btn easy ${selectedDifficulty === 'easy' ? 'selected' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDifficulty('easy');
                            }}
                        >
                            <span className="btn-text">Easy</span>
                        </button>
                    </div>
                )}

                {/* Navigation buttons */}
                <div className="navigation-buttons">
                    <button className="nav-btn prev" onClick={prevCard}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Previous
                    </button>
                    <button className="nav-btn next" onClick={nextCard}>
                        Next
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </button>
                </div>
            </div>

            {/* Keyboard shortcuts hint */}
            <div className="keyboard-hints">
                <span className="hint-item">
                    <kbd>Space</kbd> Flip
                </span>
                <span className="hint-item">
                    <kbd>←</kbd> Previous
                </span>
                <span className="hint-item">
                    <kbd>→</kbd> Next
                </span>
            </div>
        </div>
    );
};

export default Kanji;