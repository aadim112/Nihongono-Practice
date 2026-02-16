import { useState, useMemo } from "react";

const JMdictPage = () => {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);
  const [jmdictData, setJmdictData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Normalize Japanese input safely
  const normalize = (str) => str.trim().normalize("NFKC");

  // Build a fast index ONCE
  const index = useMemo(() => {
    if (!jmdictData) return new Map();
    
    const map = new Map();

    jmdictData.words.forEach(word => {
      word.kana?.forEach(k => {
        map.set(k.text, word);
      });
      word.kanji?.forEach(k => {
        map.set(k.text, word);
      });
    });

    return map;
  }, [jmdictData]);

  // Handle file upload
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        setJmdictData(data);
        setLoading(false);
      } catch (err) {
        setError("Failed to parse JSON file: " + err.message);
        setLoading(false);
      }
    };
    reader.onerror = () => {
      setError("Failed to read file");
      setLoading(false);
    };
    reader.readAsText(file);
  };

  const search = () => {
    const q = normalize(query);
    if (!q) return;

    const entry = index.get(q) || null;
    setResult(entry);
  };

  if (!jmdictData && !loading) {
    return (
      <div style={{ 
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        padding: '40px 20px',
        fontFamily: '"Manrope", sans-serif'
      }}>
        <div style={{ 
          maxWidth: '600px',
          margin: '0 auto',
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(10px)',
          borderRadius: '20px',
          padding: '60px 40px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '64px', marginBottom: '20px' }}>📚</div>
          <h1 style={{ 
            color: 'white',
            fontSize: '36px',
            marginBottom: '15px',
            fontWeight: '700',
            letterSpacing: '-0.5px'
          }}>
            JMdict Dictionary
          </h1>
          <p style={{ 
            color: 'rgba(255, 255, 255, 0.7)',
            fontSize: '16px',
            marginBottom: '40px',
            lineHeight: '1.6'
          }}>
            Upload your jmdict.json file to start searching for Japanese words
          </p>

          <label style={{
            display: 'inline-block',
            padding: '16px 40px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            borderRadius: '12px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '600',
            transition: 'transform 0.2s, box-shadow 0.2s',
            boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)';
          }}>
            Choose File
            <input 
              type="file" 
              accept=".json"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
          </label>

          {error && (
            <div style={{ 
              marginTop: '30px',
              padding: '20px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '12px',
              color: '#fca5a5'
            }}>
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center', color: 'white' }}>
          <div style={{ 
            width: '50px',
            height: '50px',
            border: '4px solid rgba(255, 255, 255, 0.1)',
            borderTop: '4px solid #667eea',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 20px'
          }}></div>
          <p style={{ fontSize: '18px', color: 'rgba(255, 255, 255, 0.8)' }}>
            Loading dictionary...
          </p>
        </div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      padding: '40px 20px',
      fontFamily: '"Manrope", sans-serif'
    }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '50px' }}>
          <h1 style={{ 
            color: 'white',
            fontSize: '48px',
            fontWeight: '800',
            marginBottom: '10px',
            letterSpacing: '-1px'
          }}>
            📖 JMdict
          </h1>
          <p style={{ 
            color: 'rgba(255, 255, 255, 0.6)',
            fontSize: '16px'
          }}>
            Japanese-English Dictionary • {jmdictData.words.length.toLocaleString()} entries
          </p>
        </div>

        {/* Search Box */}
        <div style={{ 
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(10px)',
          borderRadius: '20px',
          padding: '30px',
          marginBottom: '30px',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <div style={{ display: 'flex', gap: '15px' }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && search()}
              placeholder="Type in hiragana, katakana, or kanji..."
              style={{ 
                flex: 1,
                fontSize: '20px', 
                padding: '18px 24px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '2px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                color: 'white',
                outline: 'none',
                transition: 'all 0.3s'
              }}
              onFocus={(e) => {
                e.target.style.background = 'rgba(255, 255, 255, 0.12)';
                e.target.style.borderColor = '#667eea';
              }}
              onBlur={(e) => {
                e.target.style.background = 'rgba(255, 255, 255, 0.08)';
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              }}
            />
            <button 
              onClick={search} 
              style={{ 
                fontSize: '16px',
                padding: '18px 40px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                fontWeight: '700',
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)';
              }}
            >
              Search
            </button>
          </div>

          <div style={{ 
            marginTop: '15px',
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap'
          }}>
            {['先生', 'せんせい', 'ありがとう', '日本', 'こんにちは'].map(example => (
              <button
                key={example}
                onClick={() => {
                  setQuery(example);
                  setTimeout(() => search(), 100);
                }}
                style={{
                  padding: '8px 16px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                }}
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        {/* Result */}
        {result ? (
          <div style={{ 
            background: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(10px)',
            borderRadius: '20px',
            padding: '40px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            animation: 'fadeIn 0.4s ease-out'
          }}>
            <style>{`
              @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
              }
            `}</style>

            <div style={{ marginBottom: '30px' }}>
              <div style={{ 
                color: '#667eea',
                fontSize: '12px',
                fontWeight: '700',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                marginBottom: '8px'
              }}>
                Kanji
              </div>
              <div style={{ 
                fontSize: '36px',
                color: 'white',
                fontWeight: '300',
                letterSpacing: '2px'
              }}>
                {result.kanji?.map(k => k.text).join(', ') || '—'}
              </div>
            </div>

            <div style={{ marginBottom: '30px' }}>
              <div style={{ 
                color: '#667eea',
                fontSize: '12px',
                fontWeight: '700',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                marginBottom: '8px'
              }}>
                Reading
              </div>
              <div style={{ 
                fontSize: '28px',
                color: 'rgba(255, 255, 255, 0.9)',
                fontWeight: '300'
              }}>
                {result.kana.map(k => k.text).join(', ')}
              </div>
            </div>

            <div style={{ marginBottom: '30px' }}>
              <div style={{ 
                color: '#667eea',
                fontSize: '12px',
                fontWeight: '700',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                marginBottom: '8px'
              }}>
                Meaning
              </div>
              <div style={{ 
                fontSize: '18px',
                color: 'rgba(255, 255, 255, 0.8)',
                lineHeight: '1.8'
              }}>
                {result.sense
                  .flatMap(s => s.gloss)
                  .filter(g => g.lang === "eng")
                  .map((g, i) => (
                    <span key={i}>
                      {i > 0 && " • "}
                      {g.text}
                    </span>
                  ))}
              </div>
            </div>

            {result.sense.some(s => s.partOfSpeech.length > 0) && (
              <div>
                <div style={{ 
                  color: '#667eea',
                  fontSize: '12px',
                  fontWeight: '700',
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  marginBottom: '8px'
                }}>
                  Part of Speech
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {result.sense[0].partOfSpeech.map((pos, i) => (
                    <span key={i} style={{
                      padding: '6px 14px',
                      background: 'rgba(102, 126, 234, 0.2)',
                      border: '1px solid rgba(102, 126, 234, 0.4)',
                      borderRadius: '8px',
                      color: '#a5b4fc',
                      fontSize: '13px',
                      fontWeight: '500'
                    }}>
                      {pos}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : query ? (
          <div style={{ 
            textAlign: 'center',
            padding: '60px 40px',
            color: 'rgba(255, 255, 255, 0.5)'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '15px' }}>🔍</div>
            <p style={{ fontSize: '18px' }}>No results found for "{query}"</p>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default JMdictPage;