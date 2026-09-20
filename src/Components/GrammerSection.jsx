<<<<<<< HEAD
import { useEffect, useState } from 'react'
import './GrammerSection.css'
import grammar from './Grammar.json'
import db from './firebase'

import { ref, get, set } from 'firebase/database'

const GrammerSection = ({user}) => {
  const [grammarData, setGrammarData] = useState(grammar)

  const grammarRef = ref(db, `${user}/grammar/GrammarLearned`)

  const categoryColors = {
    Copula: '#4CAF50',
    Verb: '#2196F3',
    Particles: '#FF9800',
    Existence: '#9C27B0',
    Permission: '#009688',
    Prohibition: '#F44336'
  }

  useEffect(() => {
    const loadGrammarProgress = async () => {
      const snapshot = await get(grammarRef)

      if (snapshot.exists()) {
        const learnedArray = snapshot.val() || []
=======
import { useEffect, useState } from 'react';
import './GrammerSection.css';
import grammar from './Grammar.json';
import db from './firebase';
import { ref, get, set } from 'firebase/database';

const GrammerSection = ({ user }) => {
  const [grammarData, setGrammarData] = useState(grammar);

  const grammarRef = ref(db, `${user}/grammar/GrammarLearned`);

  const categoryColors = {
    Copula: '#10b981',
    Verb: '#3b82f6',
    Particles: '#f59e0b',
    Existence: '#8b5cf6',
    Permission: '#14b8a6',
    Prohibition: '#ef4444'
  };

  useEffect(() => {
    const loadGrammarProgress = async () => {
      const snapshot = await get(grammarRef);

      if (snapshot.exists()) {
        const learnedArray = snapshot.val() || [];
>>>>>>> dc280be (Big Update: Removed Sections other than Vocab, Grammar, Changed the UI of the wbiste. Updated data on the firebase by adding level of the vocab.)

        setGrammarData(prev =>
          prev.map(item => ({
            ...item,
            learned: learnedArray.includes(item.id) ? 1 : 0
          }))
<<<<<<< HEAD
        )
      } else {
        await set(grammarRef, [])
      }
    }

    loadGrammarProgress()
  }, [])

  const handleCheckboxChange = async (id) => {
    const snapshot = await get(grammarRef)
    const learnedArray = snapshot.exists() ? snapshot.val() : []

    let updatedArray

    if (learnedArray.includes(id)) {
      updatedArray = learnedArray.filter(item => item !== id)
    } else {
      updatedArray = [...learnedArray, id]
    }

    await set(grammarRef, updatedArray)
=======
        );
      } else {
        await set(grammarRef, []);
      }
    };

    loadGrammarProgress();
  }, [user]);

  const handleCheckboxChange = async (id) => {
    const snapshot = await get(grammarRef);
    const learnedArray = snapshot.exists() ? snapshot.val() : [];

    let updatedArray;

    if (learnedArray.includes(id)) {
      updatedArray = learnedArray.filter(item => item !== id);
    } else {
      updatedArray = [...learnedArray, id];
    }

    await set(grammarRef, updatedArray);
>>>>>>> dc280be (Big Update: Removed Sections other than Vocab, Grammar, Changed the UI of the wbiste. Updated data on the firebase by adding level of the vocab.)

    setGrammarData(prev =>
      prev.map(item =>
        item.id === id
          ? { ...item, learned: item.learned === 1 ? 0 : 1 }
          : item
      )
<<<<<<< HEAD
    )
  }
=======
    );
  };
>>>>>>> dc280be (Big Update: Removed Sections other than Vocab, Grammar, Changed the UI of the wbiste. Updated data on the firebase by adding level of the vocab.)

  return (
    <div className='GrammarSection'>
      <div className='GrammarBanner'>
<<<<<<< HEAD
        <h2 className='GrammarText'>Grammar</h2>
      </div>

      <h2 style={{ textAlign: 'center', fontFamily: 'poppins' }}>
        Mark The Grammar Rules You Have Learned
      </h2>
=======
        <h2 className='GrammarText'>文法 | Grammar</h2>
        <span className='GrammarSubtitle'>Master Essential JLPT Grammar Patterns</span>
      </div>

      <div className='GrammarSectionTitle'>
        Track your learned grammar rules below
      </div>
>>>>>>> dc280be (Big Update: Removed Sections other than Vocab, Grammar, Changed the UI of the wbiste. Updated data on the firebase by adding level of the vocab.)

      <div className='GrammarListContainer'>
        {grammarData.map(item => (
          <div className='GrammarList' key={item.id}>
            <div
              className='GrammarDiv'
              style={{
<<<<<<< HEAD
                borderTop: `10px solid ${
=======
                borderTop: `4px solid ${
>>>>>>> dc280be (Big Update: Removed Sections other than Vocab, Grammar, Changed the UI of the wbiste. Updated data on the firebase by adding level of the vocab.)
                  categoryColors[item.category] || '#607D8B'
                }`
              }}
            >
              <div className='GrammarDivHeading'>
<<<<<<< HEAD
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '15px' }}>
                  <input
                    type='checkbox'
                    checked={item.learned === 1}
                    onChange={() => handleCheckboxChange(item.id)}
                  />
                  <p style={{ margin: 0, fontWeight: 'bold' }}>
                    {item.pattern}
                  </p>
                </div>

                <p
                  style={{
                    margin: 0,
                    marginRight: '15px',
                    cursor: 'pointer',
                    color: item.learned === 1 ? '#4CAF50' : '#F44336',
                    fontWeight: '500'
                  }}
                  onClick={() => handleCheckboxChange(item.id)}
                >
                  ({item.level})--{item.learned === 1 ? 'Learned' : 'Yet to Learn'}
                </p>
              </div>

              <div className='GrammarDivOtherInfo'>
                <p>Meaning : {item.meaning}</p>
                <p>Usage : {item.usage}</p>
=======
                <div className="GrammarCheckGroup">
                  <input
                    type='checkbox'
                    id={`grammar-${item.id}`}
                    checked={item.learned === 1}
                    onChange={() => handleCheckboxChange(item.id)}
                  />
                  <label htmlFor={`grammar-${item.id}`} className='GrammarPattern'>
                    {item.pattern}
                  </label>
                </div>

                <span
                  className={`GrammarStatusBadge ${item.learned === 1 ? 'learned' : 'unlearned'}`}
                  onClick={() => handleCheckboxChange(item.id)}
                >
                  {item.level} • {item.learned === 1 ? 'Learned ✓' : 'To Learn'}
                </span>
              </div>

              <div className='GrammarDivOtherInfo'>
                <p className="GrammarInfoRow"><strong>Meaning:</strong> {item.meaning}</p>
                <p className="GrammarInfoRow"><strong>Usage:</strong> {item.usage}</p>
>>>>>>> dc280be (Big Update: Removed Sections other than Vocab, Grammar, Changed the UI of the wbiste. Updated data on the firebase by adding level of the vocab.)
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
<<<<<<< HEAD
  )
}

export default GrammerSection
=======
  );
};

export default GrammerSection;
>>>>>>> dc280be (Big Update: Removed Sections other than Vocab, Grammar, Changed the UI of the wbiste. Updated data on the firebase by adding level of the vocab.)
