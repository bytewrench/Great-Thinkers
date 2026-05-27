import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import Highlighter from 'react-highlight-words';
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
  
  const [lines, setLines] = useState([]);
  const containerRef = useRef(null);
  const cardRefs = useRef(new Map());

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

  const searchWords = searchQuery.trim().toLowerCase().split(/\s+/).filter(w => w);

  const filteredThinkers = thinkers.filter(t => {
    const matchesCategory = activeCategory === 'All' || t.category === activeCategory;
    const matchesSearch = searchWords.length === 0 || searchWords.every(word => 
      t.name.toLowerCase().includes(word) || t.content.toLowerCase().includes(word)
    );
    return matchesCategory && matchesSearch;
  });

  const updateLines = () => {
    // Only draw lines if there is a search query and multiple results
    if (searchWords.length === 0 || filteredThinkers.length < 2 || selectedThinker) {
      setLines([]);
      return;
    }
    
    if (!containerRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const newLines = [];
    const points = [];

    filteredThinkers.forEach(t => {
      const el = cardRefs.current.get(t.id);
      if (el) {
        const rect = el.getBoundingClientRect();
        points.push({
          id: t.id,
          x: rect.left - containerRect.left + rect.width / 2,
          y: rect.top - containerRect.top + rect.height / 2
        });
      }
    });

    // Create a fully connected web
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        newLines.push({
          id: `${points[i].id}-${points[j].id}`,
          x1: points[i].x,
          y1: points[i].y,
          x2: points[j].x,
          y2: points[j].y
        });
      }
    }
    setLines(newLines);
  };

  useLayoutEffect(() => {
    // Timeout allows Framer Motion animations to settle before measuring
    const timeout = setTimeout(updateLines, 400);
    window.addEventListener('resize', updateLines);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('resize', updateLines);
    };
  }, [filteredThinkers.length, searchQuery, selectedThinker, activeCategory]);

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
              placeholder="Search concepts across all thinkers..." 
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
          <div className="grid-container" ref={containerRef} style={{ position: 'relative', width: '100%', minHeight: '100%' }}>
            
            {/* BACKGROUND SVG NETWORK LINES */}
            <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}>
              <AnimatePresence>
                {lines.map(line => (
                  <motion.line
                    key={line.id}
                    x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
                    stroke="var(--accent-color)"
                    strokeWidth="1.5"
                    initial={{ opacity: 0, pathLength: 0 }}
                    animate={{ opacity: 0.15, pathLength: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                    style={{ filter: 'drop-shadow(0px 0px 4px var(--accent-color))' }}
                  />
                ))}
              </AnimatePresence>
            </svg>

            <AnimatePresence mode="wait">
              {selectedThinker ? (
                <motion.div 
                  key="view"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="markdown-body"
                  style={{ position: 'relative', zIndex: 1 }}
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
                  style={{ position: 'relative', zIndex: 1 }}
                >
                  {filteredThinkers.map(t => {
                    // Extract a clean snippet text for the preview
                    const snippet = t.content.substring(t.content.indexOf('## 1. Core Identity'), t.content.indexOf('## 2.')).replace('## 1. Core Identity & Biographical Summary', '').replace(/-/g, '').trim();

                    return (
                      <motion.div 
                        key={t.id}
                        layoutId={t.id}
                        ref={(el) => {
                          if (el) cardRefs.current.set(t.id, el);
                          else cardRefs.current.delete(t.id);
                        }}
                        className="glass-card"
                        onClick={() => setSelectedThinker(t)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        style={{ display: 'flex', flexDirection: 'column' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <User size={20} color="var(--accent-color)" />
                          </div>
                          <div>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                              <Highlighter
                                highlightStyle={{ backgroundColor: 'var(--accent-color)', color: '#000', borderRadius: '2px', padding: '0 2px' }}
                                searchWords={searchWords}
                                autoEscape={true}
                                textToHighlight={t.name}
                              />
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--accent-color)' }}>{t.category}</p>
                          </div>
                        </div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                           <Highlighter
                              highlightStyle={{ backgroundColor: 'var(--accent-color)', color: '#000', borderRadius: '2px', padding: '0 2px' }}
                              searchWords={searchWords}
                              autoEscape={true}
                              textToHighlight={snippet}
                            />
                        </div>
                      </motion.div>
                    )
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
