import { useEffect, useState } from 'react'
import './GrammerSection.css'
import grammar from './Grammar.json'
import db from './firebase'

import { ref, get, set } from 'firebase/database'

const GrammerSection = () => {
  const [grammarData, setGrammarData] = useState(grammar)

  const grammarRef = ref(db, 'grammar/GrammarLearned')

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

        setGrammarData(prev =>
          prev.map(item => ({
            ...item,
            learned: learnedArray.includes(item.id) ? 1 : 0
          }))
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

    setGrammarData(prev =>
      prev.map(item =>
        item.id === id
          ? { ...item, learned: item.learned === 1 ? 0 : 1 }
          : item
      )
    )
  }

  return (
    <div className='GrammarSection'>
      <div className='GrammarBanner'>
        <h2 className='GrammarText'>Grammar</h2>
      </div>

      <h2 style={{ textAlign: 'center', fontFamily: 'poppins' }}>
        Mark The Grammar Rules You Have Learned
      </h2>

      <div className='GrammarListContainer'>
        {grammarData.map(item => (
          <div className='GrammarList' key={item.id}>
            <div
              className='GrammarDiv'
              style={{
                borderTop: `10px solid ${
                  categoryColors[item.category] || '#607D8B'
                }`
              }}
            >
              <div className='GrammarDivHeading'>
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
                  {item.learned === 1 ? 'Learned' : 'Yet to Learn'}
                </p>
              </div>

              <div className='GrammarDivOtherInfo'>
                <p>Meaning : {item.meaning}</p>
                <p>Usage : {item.usage}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default GrammerSection
