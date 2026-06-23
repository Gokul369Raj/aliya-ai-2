export function analyzeFileStatic(path, content, allNodes = []) {
  if (!content) return null;

  const lines = content.split('\n');
  const lineCount = lines.length;
  
  // Complexity heuristic
  let complexity = 'Simple';
  if (lineCount > 300 || content.match(/function|class|=>/g)?.length > 10) {
    complexity = 'Complex';
  } else if (lineCount > 100 || content.match(/function|class|=>/g)?.length > 4) {
    complexity = 'Medium';
  }

  // Architecture Role heuristic
  let role = 'Utility';
  const lowerPath = path.toLowerCase();
  const lowerContent = content.toLowerCase();
  
  if (lowerPath.includes('component') || lowerPath.includes('view') || lowerPath.match(/\.jsx?|\.tsx?$/) && lowerContent.includes('react')) {
    role = 'Frontend Component';
  } else if (lowerPath.includes('api') || lowerPath.includes('route') || lowerPath.includes('controller')) {
    role = 'API / Backend Route';
  } else if (lowerPath.includes('model') || lowerPath.includes('schema') || lowerPath.includes('db')) {
    role = 'Database Model';
  } else if (lowerPath.includes('config') || lowerPath.includes('setup')) {
    role = 'Configuration';
  } else if (lowerPath.includes('auth')) {
    role = 'Authentication';
  } else if (lowerPath.includes('service')) {
    role = 'Service Layer';
  } else if (lowerPath.includes('hook') || lowerPath.includes('use')) {
    role = 'React Hook';
  }

  // Key Functions heuristic
  const functions = [];
  const fnRegex = /(?:function\s+([a-zA-Z0-9_]+))|(?:const\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>)|(?:class\s+([a-zA-Z0-9_]+))/g;
  let match;
  while ((match = fnRegex.exec(content)) !== null) {
    const name = match[1] || match[2] || match[3];
    if (name && !functions.includes(name)) {
      functions.push(name);
      if (functions.length >= 5) break; // limit to top 5
    }
  }

  // Dependencies heuristic (imports)
  const dependencies = [];
  const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
  let impMatch;
  while ((impMatch = importRegex.exec(content)) !== null) {
    const dep = impMatch[1];
    if (dep && !dependencies.includes(dep)) {
      dependencies.push(dep);
      if (dependencies.length >= 8) break;
    }
  }

  return {
    complexity,
    role,
    functions: functions.length > 0 ? functions : ['No major functions found'],
    dependencies: dependencies.length > 0 ? dependencies : ['No external imports'],
  };
}
