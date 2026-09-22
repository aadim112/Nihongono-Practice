import { useEffect, useState } from 'react';
import './GrammerSection.css';
import grammar from './Grammar.json';
import db from './firebase';
import { ref, get, set } from 'firebase/database';

const GrammerSection = ({ user, selectedLevel = 'N5' }) => {
  const [grammarData, setGrammarData] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Add Grammar Form State
  const [newPattern, setNewPattern] = useState('');
  const [newMeaning, setNewMeaning] = useState('');
  const [newUsage, setNewUsage] = useState('');
  const [newExampleJp, setNewExampleJp] = useState('');
  const [newExampleEn, setNewExampleEn] = useState('');
  const [newLevel, setNewLevel] = useState(selectedLevel);

  const grammarLearnedRef = ref(db, `${user}/grammar/GrammarLearned`);
  const customPatternsRef = ref(db, `${user}/grammar/customPatterns`);

  const categoryColors = {
    Copula: '#10b981',
    Verb: '#3b82f6',
    Particles: '#f59e0b',
    Existence: '#8b5cf6',
    Permission: '#14b8a6',
    Prohibition: '#ef4444',
    Custom: '#c5050c'
  };

  useEffect(() => {
    setNewLevel(selectedLevel);
  }, [selectedLevel]);

  useEffect(() => {
    const loadGrammarData = async () => {
      try {
        // Fetch learned IDs array
        const learnedSnapshot = await get(grammarLearnedRef);
        const learnedArray = learnedSnapshot.exists() ? (learnedSnapshot.val() || []) : [];

        // Fetch custom user patterns from Firebase
        const customSnapshot = await get(customPatternsRef);
        const customItems = customSnapshot.exists() ? (customSnapshot.val() || []) : [];

        // Combine static Grammar.json with Firebase custom patterns
        const combined = [...grammar, ...customItems];

        // Map learned status
        const updatedData = combined.map(item => ({
          ...item,
          learned: learnedArray.includes(item.id) ? 1 : 0
        }));

        setGrammarData(updatedData);

        if (!learnedSnapshot.exists()) {
          await set(grammarLearnedRef, []);
        }
      } catch (error) {
        console.error("Error loading grammar data from Firebase:", error);
      }
    };

    loadGrammarData();
  }, [user]);

  const handleCheckboxChange = async (id) => {
    try {
      const snapshot = await get(grammarLearnedRef);
      const learnedArray = snapshot.exists() ? (snapshot.val() || []) : [];

      let updatedArray;
      if (learnedArray.includes(id)) {
        updatedArray = learnedArray.filter(item => item !== id);
      } else {
        updatedArray = [...learnedArray, id];
      }

      await set(grammarLearnedRef, updatedArray);

      setGrammarData(prev =>
        prev.map(item =>
          item.id === id
            ? { ...item, learned: item.learned === 1 ? 0 : 1 }
            : item
        )
      );
    } catch (error) {
      console.error("Error updating learned status:", error);
    }
  };

  const handleAddGrammarPattern = async (e) => {
    e.preventDefault();
    if (!newPattern.trim() || !newMeaning.trim()) return;

    try {
      const customSnapshot = await get(customPatternsRef);
      const existingCustom = customSnapshot.exists() ? (customSnapshot.val() || []) : [];

      const newRule = {
        id: `custom-g-${Date.now()}`,
        pattern: newPattern.trim(),
        meaning: newMeaning.trim(),
        usage: newUsage.trim() || 'N/A',
        example_jp: newExampleJp.trim() || '',
        example_en: newExampleEn.trim() || '',
        level: newLevel || selectedLevel || 'N5',
        category: 'Custom',
        createdAt: Date.now()
      };

      const updatedCustom = [...existingCustom, newRule];
      await set(customPatternsRef, updatedCustom);

      // Update local state
      setGrammarData(prev => [
        ...prev,
        { ...newRule, learned: 0 }
      ]);

      // Reset form
      setNewPattern('');
      setNewMeaning('');
      setNewUsage('');
      setNewExampleJp('');
      setNewExampleEn('');
    } catch (error) {
      console.error("Error adding custom grammar pattern:", error);
      alert("Failed to save grammar pattern to Firebase. Please try again.");
    }
  };

  // Filter grammar rules in real-time
  const filteredGrammar = grammarData.filter(item => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (item.pattern && item.pattern.toLowerCase().includes(q)) ||
      (item.meaning && item.meaning.toLowerCase().includes(q)) ||
      (item.usage && item.usage.toLowerCase().includes(q)) ||
      (item.example_jp && item.example_jp.toLowerCase().includes(q)) ||
      (item.example_en && item.example_en.toLowerCase().includes(q)) ||
      (item.level && item.level.toLowerCase().includes(q)) ||
      (item.category && item.category.toLowerCase().includes(q))
    );
  });

  return (
    <div className='GrammarSection'>
      {/* Banner */}
      <div className='GrammarBanner'>
        <h2 className='GrammarText'>文法 | Grammar</h2>
        <span className='GrammarSubtitle'>Master Essential JLPT Grammar Patterns & Custom Rules</span>
      </div>

      {/* Add Custom Grammar Form Card */}
      <div className='GrammarAddCard'>
        <div className="GrammarFormHeader">
          <span className="FormCardIcon">✍️</span>
          <h3>Add New Grammar Pattern</h3>
        </div>
        <form className='GrammarAddForm' onSubmit={handleAddGrammarPattern}>
          <div className='GrammarInputRow'>
            <input
              type='text'
              className='GrammarInputField'
              placeholder='Grammar Pattern (e.g. 〜てはいけません)...'
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              required
            />
            <input
              type='text'
              className='GrammarInputField'
              placeholder='Meaning (e.g. Must not do...)...'
              value={newMeaning}
              onChange={(e) => setNewMeaning(e.target.value)}
              required
            />
          </div>

          <div className='GrammarInputRow'>
            <input
              type='text'
              className='GrammarInputField'
              placeholder='Usage / Structure (e.g. Verb-te + はいけません)...'
              value={newUsage}
              onChange={(e) => setNewUsage(e.target.value)}
            />
          </div>

          <div className='GrammarInputRow'>
            <input
              type='text'
              className='GrammarInputField'
              placeholder='Example (Japanese e.g. ここで写真を撮ってはいけません)...'
              value={newExampleJp}
              onChange={(e) => setNewExampleJp(e.target.value)}
            />
            <input
              type='text'
              className='GrammarInputField'
              placeholder='Example (English e.g. You must not take photos here)...'
              value={newExampleEn}
              onChange={(e) => setNewExampleEn(e.target.value)}
            />
          </div>

          <div className='GrammarInputRow' style={{ justifyContent: 'space-between' }}>
            <div className='GrammarLevelSelectGroup'>
              <label className='GrammarLevelLabel'>Level:</label>
              <select
                className='GrammarLevelSelect'
                value={newLevel}
                onChange={(e) => setNewLevel(e.target.value)}
              >
                <option value='N5'>N5 Level</option>
                <option value='N4'>N4 Level</option>
                <option value='N3'>N3 Level</option>
              </select>
            </div>

            <button type='submit' className='GrammarSubmitBtn' disabled={!newPattern.trim() || !newMeaning.trim()}>
              + Add Pattern
            </button>
          </div>
        </form>
      </div>

      {/* Search Bar & Statistics Header */}
      <div className='GrammarSearchCard'>
        <div className='GrammarSearchInputWrapper'>
          <span className='GrammarSearchIcon'>🔍</span>
          <input
            type='text'
            className='GrammarSearchInput'
            placeholder='Search pattern, meaning, usage, example, or level (e.g. N5, 〜です)...'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className='GrammarSearchClearBtn' onClick={() => setSearchQuery('')}>
              ✕
            </button>
          )}
        </div>

        <div className='GrammarSearchStats'>
          Showing <strong>{filteredGrammar.length}</strong> of <strong>{grammarData.length}</strong> grammar rules
        </div>
      </div>

      {/* Grammar Cards Grid */}
      <div className='GrammarListContainer'>
        {filteredGrammar.length === 0 ? (
          <div className='GrammarEmptyState'>
            No grammar patterns match "{searchQuery}". Try searching another term or add a new pattern above.
          </div>
        ) : (
          filteredGrammar.map(item => (
            <div className='GrammarList' key={item.id}>
              <div
                className={`GrammarDiv ${item.learned === 1 ? 'is-learned' : ''}`}
                style={{
                  borderTop: item.learned === 1 ? '4px solid #10b981' : `4px solid ${
                    categoryColors[item.category] || '#c5050c'
                  }`
                }}
              >
                <div className='GrammarDivHeading'>
                  <div className="GrammarCheckGroup">
                    <input
                      type='checkbox'
                      className='GrammarCheckbox'
                      id={`grammar-${item.id}`}
                      checked={item.learned === 1}
                      onChange={() => handleCheckboxChange(item.id)}
                    />
                    <label htmlFor={`grammar-${item.id}`} className={`GrammarPattern ${item.learned === 1 ? 'learned' : ''}`}>
                      {item.pattern}
                    </label>
                  </div>

                  <span
                    className={`GrammarStatusBadge ${item.learned === 1 ? 'learned' : 'unlearned'}`}
                    onClick={() => handleCheckboxChange(item.id)}
                  >
                    {item.level || 'N5'} • {item.learned === 1 ? 'Learned ✓' : 'To Learn'}
                  </span>
                </div>

                <div className='GrammarDivOtherInfo'>
                  <p className="GrammarInfoRow"><strong>Meaning:</strong> {item.meaning}</p>
                  <p className="GrammarInfoRow"><strong>Usage:</strong> {item.usage}</p>
                  {(item.example_jp || item.example_en) && (
                    <p className="GrammarInfoRow GrammarExample">
                      <strong>Example:</strong> {item.example_jp} {item.example_en && <em>({item.example_en})</em>}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default GrammerSection;
