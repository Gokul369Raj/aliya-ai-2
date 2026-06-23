# Aliya AI

Google Maps for codebases with a graph-native AI briefing layer.

Aliya AI is a local-first developer tool that helps you understand any GitHub repository in seconds using 3D graph visualizations and AI-powered explanations.

![Aliya AI Interface](https://raw.githubusercontent.com/expressjs/express/master/Readme.md)

## Features

- **Local-first**: Clones the repository to your machine and parses it locally.
- **3D & 2D Graphs**: Explore codebases via immersive 3D force-directed graphs or clean 2D node topologies.
- **AI Explanations**: Provide your own OpenAI or Gemini API key (stored entirely locally) and ask questions about the repository architecture, dependencies, or specific files.
- **File Inspector**: Click on any node to immediately view its contents in a built-in Monaco editor.
- **Professional Node Colors**: Instantly recognize file types using a custom, syntax-aware color legend.
- **Interactive Controls**: Zoom, pan, and focus directly on selected files.

---

## 🚀 Getting Started (How to Run Locally)

Follow these instructions if you want to clone this project from GitHub and run it on your own system.

### 1. Clone the repository
Open your terminal and run:
```bash
git clone <your-repository-url-here>
cd "aliya ai"
```

### 2. Install Dependencies
Since this is a full-stack project, you need to install the Node.js packages for both the Root (Backend) and the Client (Frontend).

**Install Root (Backend) Packages:**
```bash
npm install
```

**Install Client (Frontend) Packages:**
```bash
cd client
npm install
cd ..
```

### 3. Start the Server
Once everything is installed, run the development server from the root folder:
```bash
npm run dev
```

This command automatically starts both the backend and frontend at the same time. Open your browser and go to `http://localhost:3000` (or whatever port is shown in the terminal) to start exploring!

---

## How to use

1. Enter a valid public GitHub repository URL.
2. Wait for Aliya AI to clone the repository and build the graph.
3. Explore the nodes (files and folders).
4. Add your API key in the AI panel to ask questions about the selected files or the repository as a whole.
