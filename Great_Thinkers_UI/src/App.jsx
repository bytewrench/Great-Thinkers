import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Search, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './index.css';

// Load all markdown files eagerly as raw text
const mdModules = import.meta.glob('../../Great_Thinkers/**/*.md', { query: '?raw', import: 'default', eager: true });

function App() {
  const [thinkers, setThinkers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedThinker, setSelectedThinker] = useState(null);

  useEffect(() => {
    const loadedThinkers = [];
    const catSet = new Set();
    
    for (const path in mdModules) {
      // Path format: ../../Great_Thinkers/Category_Name/Thinker_Name.md
      const parts = path.split('/');
      const filename = parts.pop();
      const category = parts.pop().replace(/_/g, ' ');
      const name = filename.replace('.md', '').replace(/_/g, ' ');
      const content = mdModules[path];
      
      catSet.add(category);
      loadedThinkers.push({
        id: path,
        name,
        category,
        content
      });
    }
    
    setCategories(['All', ...Array.from(catSet).sort()]);
    setThinkers(loadedThinkers.sort((a, b) => a.name.localeCompare(b.name)));
  }, []);

  const filteredThinkers = thinkers.filter(t => {
    const matchesCategory = activeCategory === 'All' || t.category === activeCategory;
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          t.content.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="app-container glass">
      {/* SIDEBAR */}
      <div className="sidebar glass">
        <div className="sidebar-header">
          <h2 style={{ color: 'var(--accent-color)', fontSize: '1.5rem', marginBottom: 0, border: 'none' }}>
            Great Thinkers
          </h2>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>The Library of Minds</p>
        </div>
        <div className="sidebar-content">
          <h4 style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.8rem', marginTop: '1rem' }}>
            Categories
          </h4>
          {categories.map(c => (
            <div 
              key={c} 
              className={`category-item ${activeCategory === c ? 'active' : ''}`}
              onClick={() => {
                setActiveCategory(c);
                setSelectedThinker(null);
              }}
            >
              {c}
            </div>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="main-content">
        <div className="top-bar glass">
          <div style={{ position: 'relative', width: '400px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Search thinkers or concepts..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '40px' }}
            />
          </div>
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>{filteredThinkers.length} thinkers found</span>
          </div>
        </div>

        <div className="content-area">
          <AnimatePresence mode="wait">
            {selectedThinker ? (
              <motion.div 
                key="view"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="markdown-body"
              >
                <button className="primary back-btn" onClick={() => setSelectedThinker(null)}>
                  ← Back to Grid
                </button>
                <div className="glass-card" style={{ cursor: 'default' }}>
                  <ReactMarkdown>{selectedThinker.content}</ReactMarkdown>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid"
              >
                {filteredThinkers.map(t => (
                  <motion.div 
                    key={t.id}
                    layoutId={t.id}
                    className="glass-card"
                    onClick={() => setSelectedThinker(t)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <User size={20} color="var(--accent-color)" />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>{t.name}</h3>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--accent-color)' }}>{t.category}</p>
                      </div>
                    </div>
                    <p style={{ fontSize: '0.9rem', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {t.content.substring(t.content.indexOf('## 1. Core Identity'), t.content.indexOf('## 2.')).replace('## 1. Core Identity & Biographical Summary', '').replace('-', '').trim()}
                    </p>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default App;
