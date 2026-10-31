export type ThemeMode = 'obsidian' | 'minimal' | 'titanium';

export type CameraPreset = 'isometric' | 'angled' | 'top' | 'agent1' | 'agent2';

export interface ThemeColors {
  bg: string;
  fog: string;
  gridCellBase: string;
  gridCellTop: string;
  gridRoughness: number;
  gridMetalness: number;
  plinthBase: string;
  agent1Color: string;
  agent1Accent: string;
  agent2Color: string;
  agent2Accent: string;
  hoverHighlight: string;
}

export const THEMES: Record<ThemeMode, ThemeColors> = {
  obsidian: {
    bg: '#080a0f',
    fog: '#080a0f',
    gridCellBase: '#151922',
    gridCellTop: '#1e2430',
    gridRoughness: 0.25,
    gridMetalness: 0.45,
    plinthBase: '#0d1017',
    agent1Color: '#00f0ff',
    agent1Accent: '#38bdf8',
    agent2Color: '#ff6b35',
    agent2Accent: '#fbbf24',
    hoverHighlight: '#6366f1',
  },
  minimal: {
    bg: '#0d1117',
    fog: '#0d1117',
    gridCellBase: '#21262d',
    gridCellTop: '#30363d',
    gridRoughness: 0.5,
    gridMetalness: 0.1,
    plinthBase: '#161b22',
    agent1Color: '#10b981',
    agent1Accent: '#34d399',
    agent2Color: '#ec4899',
    agent2Accent: '#f472b6',
    hoverHighlight: '#8b5cf6',
  },
  titanium: {
    bg: '#0b0f19',
    fog: '#0b0f19',
    gridCellBase: '#252e3e',
    gridCellTop: '#3b465c',
    gridRoughness: 0.18,
    gridMetalness: 0.85,
    plinthBase: '#171e2c',
    agent1Color: '#06b6d4',
    agent1Accent: '#67e8f9',
    agent2Color: '#e11d48',
    agent2Accent: '#fda4af',
    hoverHighlight: '#38bdf8',
  },
};
