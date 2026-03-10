const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Move API_BASE_URL up
content = content.replace("const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5177';", "");
content = content.replace("function App() {\n", "function App() {\n  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5177';\n");

// Replace activeCategoryFetchRef remaining instances
content = content.replace(/if \(activeCategoryFetchRef\.current === categoryName\) \{/g, "if (selectedCategory === categoryName) {");
content = content.replace(/activeCategoryFetchRef\.current = categoryName;/g, "");

fs.writeFileSync('src/App.tsx', content);
