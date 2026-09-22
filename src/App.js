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
  const users = [
    { id: 0, name: "アーディティヤ" },
    { id: 1, name: "スネハ" },
  ];
  const selectedUserName = users.find(u => u.id === user)?.name ?? String(user);

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
            {activeTab === 2 && (
              <GrammerSection
                key={`${user}-${selectedLevel}`}
                user={user}
                selectedLevel={selectedLevel}
              />
            )}
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
  );
}

export default App;
