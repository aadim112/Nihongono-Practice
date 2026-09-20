<<<<<<< HEAD
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
import YoutubePractice from './Components/YoutubePractice';


function App() {

  const [ConsistentDays,setConsistentDays] = useState({}); 
  const [user,setUser] = useState(0);
=======
import { useState, useEffect } from 'react';
import './App.css';
import ConsistencyGraph from './Components/ConsistencyGraph';
import banner1 from './Assets/banner1.jpg';
import banner2 from './Assets/banner2.jpg';
import VocabSection from './Components/Vocab';
import GrammerSection from './Components/GrammerSection';
import db from './Components/firebase';
import { get, ref } from 'firebase/database';

function App() {
  const [ConsistentDays, setConsistentDays] = useState({});
  const [user, setUser] = useState(0);
  const [selectedLevel, setSelectedLevel] = useState('N5');
>>>>>>> dc280be (Big Update: Removed Sections other than Vocab, Grammar, Changed the UI of the wbiste. Updated data on the firebase by adding level of the vocab.)
  const users = [
    { id: 0, name: "アーディティヤ" },
    { id: 1, name: "スネハ" },
  ];
  const selectedUserName = users.find(u => u.id === user)?.name ?? String(user);

  useEffect(() => {
<<<<<<< HEAD
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
  }, [user]);

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
            {users.map(u => (
              <option key={u.id} value={u.id} style={{color:'red',fontWeight:'bold'}}>{u.name}</option>
            ))}
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
        <div className='KanjiButton' onClick={()=>{setWindow(6)}}>
          <img style={{width:'50px',height:'100%',borderTopLeftRadius:'6px',borderBottomLeftRadius:'6px',objectFit:'cover', filter: 'hue-rotate(90deg)'}} src={banner1}></img>
          <p style={{fontFamily:"Shippori Antique"}}>Video | 動画</p>
        </div>
      </div>
      <div className='RightSide'>
        <div className='DefaultWindow'>
          <ConsistencyGraph activityData={ConsistentDays} user={user}/>
        </div>
        {window === 1 &&  <VocabSection key={user} user={user} userName={selectedUserName} users={users} />}
        {window === 2 &&  <GrammerSection key={user} user={user}/>}
        {window === 3 &&  <Kanji key={user} user={user}/>}
        {window === 4 && <Listening key={user} user={user}/>}
        {window === 5 && <Reading key={user} user={user}/>}
        {window === 6 && <YoutubePractice key={user} user={user}/>}
      </div>
    </div>
    <footer></footer>
    </>
=======
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
  }, [user]);

  const [activeTab, setActiveTab] = useState(1); // 1: Vocab, 2: Grammar

  return (
    <div className="AppContainer">
      {/* Header */}
      <header className="Navbar">
        <div className="NavBrand">
          <span className="NavLogoIcon">⛩️</span>
          <div className="NavTitleGroup">
            <h1 className="NavTitle">日本語 Practice</h1>
            <span className="NavSubtitle">いらっしゃいませ！</span>
          </div>
        </div>

        <div className="UserSmallInfo">
          <div className="UserSelectPill">
            <span className="material-symbols-outlined UserIcon">person</span>
            <select
              className="UserSelect"
              value={user}
              onChange={(e) => setUser(Number(e.target.value))}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="LevelSelectPill">
            <span className="BadgeDot"></span>
            <select
              className="LevelSelect"
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
            >
              <option value="N5">N5 Level</option>
              <option value="N4">N4 Level</option>
              <option value="N3">N3 Level</option>
            </select>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="MainComponent">
        {/* Left Sidebar on Desktop */}
        <nav className="LeftSideDesktop">
          <button
            className={`NavTabBtn ${activeTab === 1 ? 'active' : ''}`}
            onClick={() => setActiveTab(1)}
          >
            <div className="NavBtnImageWrap">
              <img alt="Vocab" src={banner1} />
            </div>
            <div className="NavBtnLabel">
              <span className="NavBtnMain">Vocab</span>
              <span className="NavBtnSub">語彙</span>
            </div>
          </button>

          <button
            className={`NavTabBtn ${activeTab === 2 ? 'active' : ''}`}
            onClick={() => setActiveTab(2)}
          >
            <div className="NavBtnImageWrap">
              <img alt="Grammar" src={banner2} />
            </div>
            <div className="NavBtnLabel">
              <span className="NavBtnMain">Grammar</span>
              <span className="NavBtnSub">文法</span>
            </div>
          </button>

          {/* GitHub-style Consistency Heatmap inside Sidebar */}
          <div className="SidebarConsistencyWrapper">
            <ConsistencyGraph activityData={ConsistentDays} user={user} />
          </div>
        </nav>

        {/* Content Container */}
        <section className="RightSide">
          {/* Mobile Consistency View (< 768px) */}
          <div className="MobileConsistencySection">
            <ConsistencyGraph activityData={ConsistentDays} user={user} />
          </div>

          {/* Main Active Tab View */}
          <div className="TabContentWrapper">
            {activeTab === 1 && (
              <VocabSection
                key={`${user}-${selectedLevel}`}
                user={user}
                userName={selectedUserName}
                users={users}
                selectedLevel={selectedLevel}
              />
            )}
            {activeTab === 2 && <GrammerSection key={user} user={user} />}
          </div>
        </section>
      </main>

      {/* Mobile Bottom Navigation Bar (< 768px) */}
      <nav className="MobileBottomNav">
        <button
          className={`BottomNavTab ${activeTab === 1 ? 'active' : ''}`}
          onClick={() => setActiveTab(1)}
        >
          <span className="BottomNavIcon">📖</span>
          <span className="BottomNavText">Vocab | 語彙</span>
        </button>

        <button
          className={`BottomNavTab ${activeTab === 2 ? 'active' : ''}`}
          onClick={() => setActiveTab(2)}
        >
          <span className="BottomNavIcon">⛩️</span>
          <span className="BottomNavText">Grammar | 文法</span>
        </button>
      </nav>
    </div>
>>>>>>> dc280be (Big Update: Removed Sections other than Vocab, Grammar, Changed the UI of the wbiste. Updated data on the firebase by adding level of the vocab.)
  );
}

export default App;
