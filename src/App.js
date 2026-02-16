import logo from './logo.svg';
import { useState,useEffect, use } from 'react';
import './App.css';
import ConsistencyGraph from './Components/ConsistencyGraph';
import banner1 from './Assets/banner1.jpg'
import banner2 from './Assets/banner2.jpg'
import banner3 from './Assets/banner3.jpg'
import banner4 from './Assets/banner4.jpg'
import banner5 from './Assets/banner5.jpg'
import lantern from './Assets/lantern.jpg'
import VocabSection from './Components/Vocab';
import GrammerSection from './Components/GrammerSection';
import Reading from './Components/Reading';
import Listening from './Components/Listening';
import db from './Components/firebase';
import { get, ref } from 'firebase/database';
import Kanji from './Components/Kanji';


function App() {

  const [ConsistentDays,setConsistentDays] = useState({}); 
  const [user,setUser] = useState(0);

  useEffect(() => {
      const fetchConsistency = async () => {
          try {
              const consistencyRef = ref(db, `${user}/Consistency`);
              const snapshot = await get(consistencyRef);

              if (snapshot.exists()) {
                  setConsistentDays(snapshot.val());
              } else {
                  setConsistentDays({});
              }
          } catch (error) {
              console.error("Error fetching consistency:", error);
          }
      };

      fetchConsistency();
  }, []);

  const mockData = {
    "2026-01-01": 2,
    "2026-01-02": 4,
    "2026-01-03": 1,
  };
  const [window,setWindow] = useState(1);

  return (
    <>
    <div className='Navbar'>
      <h2>日本語の Practice</h2>
      <div style={{borderBottom:'2px solid red',height:'100%'}}>
        <h3 style={{fontFamily:"Shippori Antique"}}>いらっしゃいませ!</h3>
      </div>
      <div className='UserSmallInfo'>
        <div className='UserName'>
          <span className="material-symbols-outlined">person</span>
          <select style={{color:'red',fontWeight:'bold',border:'0px'}} value={user} onChange={(e) => setUser(Number(e.target.value))}>
            <option value={0} style={{color:'red',fontWeight:'bold'}}>アーディティヤ</option>
            <option value={1} style={{color:'red',fontWeight:'bold'}}>スネハ</option>
          </select>
        </div>
        |
        <div className='LeveIndicator'><p style={{margin:'0px'}}>{user == 0 ? "N5 Level" : "N4 Level"}</p></div>
      </div>
    </div>
    <div className='MainComponent'>
      <div className='LeftSide'>
        <div className='VocabButton' onClick={()=>{setWindow(1)}}>
          <img style={{width:'50px',height:'100%',borderTopLeftRadius:'6px',borderBottomLeftRadius:'6px',objectFit:'cover'}} src={banner1}></img>
          <p style={{fontFamily:"Shippori Antique"}}>Vocab | 語彙</p>
        </div>
        <div className='GrammarButton' onClick={()=>{setWindow(2)}}>
          <img style={{width:'50px',height:'100%',borderTopLeftRadius:'6px',borderBottomLeftRadius:'6px',objectFit:'cover'}} src={banner2}></img>
          <p style={{fontFamily:"Shippori Antique"}}>Grammar | 文法</p>
        </div>
        <div className='KanjiButton' onClick={()=>{setWindow(3)}}>
          <img style={{width:'50px',height:'100%',borderTopLeftRadius:'6px',borderBottomLeftRadius:'6px',objectFit:'cover'}} src={banner3}></img>
          <p style={{fontFamily:"Shippori Antique"}}>Kanji | 漢字</p>
        </div>
        <div className='KanjiButton' onClick={()=>{setWindow(4)}}>
          <img style={{width:'50px',height:'100%',borderTopLeftRadius:'6px',borderBottomLeftRadius:'6px',objectFit:'cover'}} src={banner5}></img>
          <p style={{fontFamily:"Shippori Antique"}}>Listening | きく</p>
        </div>
        <div className='KanjiButton' onClick={()=>{setWindow(5)}}>
          <img style={{width:'50px',height:'100%',borderTopLeftRadius:'6px',borderBottomLeftRadius:'6px',objectFit:'cover'}} src={banner4}></img>
          <p style={{fontFamily:"Shippori Antique"}}>Reading | よむ</p>
        </div>
      </div>
      <div className='RightSide'>
        <div className='DefaultWindow'>
          <ConsistencyGraph activityData={ConsistentDays} user={user}/>
        </div>
        {window === 1 &&  <VocabSection user={user}/>}
        {window === 2 &&  <GrammerSection user={user}/>}
        {window === 3 &&  <Kanji user={user}/>}
        {window === 4 && <Listening user={user}/>}
        {window === 5 && <Reading user={user}/>}
      </div>
    </div>
    <footer></footer>
    </>
  );
}

export default App;
