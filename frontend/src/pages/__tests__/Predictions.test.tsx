import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import Predictions from '../Predictions';

vi.mock('../../services/api', () => ({
  api: {
    getPredictions: vi.fn(),
  },
}));

import { api } from '../../services/api';

const mockPrediction = {
  fixtureId: 'fix-1',
  homeTeam: {
    id: 'MEL',
    name: 'Melbourne Storm',
    ladderPos2025: 1,
    wins2025: 20,
    losses2025: 5,
    recentForm: 'WWWWL',
    titleOdds: 4.0,
    injuries: [],
    completionRate: null,
    tackleEfficiency: null,
    errorCount: null,
    penaltyCount: null,
    possessionAvg: null,
  },
  awayTeam: {
    id: 'PEN',
    name: 'Penrith Panthers',
    ladderPos2025: 3,
    wins2025: 17,
    losses2025: 8,
    recentForm: 'WLWWL',
    titleOdds: 6.0,
    injuries: [],
    completionRate: null,
    tackleEfficiency: null,
    errorCount: null,
    penaltyCount: null,
    possessionAvg: null,
  },
  venue: 'AAMI Park',
  h2h: '3-2 in 5 games (2024-25)',
  predictedWinner: 'Melbourne Storm',
  predictedWinnerId: 'MEL',
  confidence: 'HIGH',
  confidenceScore: 70,
  factors: [
    { name: '2025 Ladder Position', favouring: 'Melbourne Storm', weight: 3, detail: 'MEL #1 vs PEN #3' },
  ],
  summary: 'Melbourne Storm predicted to win at AAMI Park.',
};

const mockApiData = {
  season: '2026',
  round: 1,
  totalMatches: 1,
  summary: [
    {
      match: 'Melbourne Storm v Penrith Panthers',
      venue: 'AAMI Park',
      pick: 'Melbourne Storm',
      pickTeamId: 'MEL',
      confidence: 'HIGH',
      confidenceScore: 70,
    },
  ],
  predictions: [mockPrediction],
};

describe('Predictions page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner while query is pending', () => {
    vi.mocked(api.getPredictions).mockReturnValue(new Promise(() => {})); // never resolves
    renderWithProviders(<Predictions />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows error message when API call fails', async () => {
    vi.mocked(api.getPredictions).mockRejectedValueOnce(new Error('Network error'));
    renderWithProviders(<Predictions />);
    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });
  });

  it('renders "Round Predictions" heading', async () => {
    vi.mocked(api.getPredictions).mockResolvedValueOnce(mockApiData);
    renderWithProviders(<Predictions />);
    expect(screen.getByText('Round Predictions')).toBeInTheDocument();
  });

  it('renders one PredictionCard per prediction', async () => {
    vi.mocked(api.getPredictions).mockResolvedValueOnce(mockApiData);
    renderWithProviders(<Predictions />);
    await waitFor(() => {
      expect(screen.getByText('Melbourne Storm')).toBeInTheDocument();
      expect(screen.getByText('Penrith Panthers')).toBeInTheDocument();
    });
  });

  it('highlights predicted winner in emerald text', async () => {
    vi.mocked(api.getPredictions).mockResolvedValueOnce(mockApiData);
    renderWithProviders(<Predictions />);
    await waitFor(() => {
      // The home team (MEL) is the predicted winner — finds within PredictionCard
      const cards = document.querySelectorAll('.text-emerald-400');
      expect(cards.length).toBeGreaterThan(0);
    });
  });

  it('shows confidence score percentage', async () => {
    vi.mocked(api.getPredictions).mockResolvedValueOnce(mockApiData);
    renderWithProviders(<Predictions />);
    await waitFor(() => {
      // Summary strip shows "70%" as standalone text in the confidence score tile
      const el = screen.getByText('70%');
      expect(el).toBeInTheDocument();
    });
  });

  it('shows "Show analysis" button and expands on click', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getPredictions).mockResolvedValueOnce(mockApiData);
    renderWithProviders(<Predictions />);

    await waitFor(() => screen.getByText('Show analysis'));

    await user.click(screen.getByText('Show analysis'));
    expect(screen.getByText('Hide analysis')).toBeInTheDocument();
    expect(screen.getByText('Contributing Factors')).toBeInTheDocument();
  });

  it('shows a FactorBar for each factor when expanded', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getPredictions).mockResolvedValueOnce(mockApiData);
    renderWithProviders(<Predictions />);

    await waitFor(() => screen.getByText('Show analysis'));
    await user.click(screen.getByText('Show analysis'));

    expect(screen.getByText('2025 Ladder Position')).toBeInTheDocument();
  });

  it('summary strip shows each pick', async () => {
    vi.mocked(api.getPredictions).mockResolvedValueOnce(mockApiData);
    renderWithProviders(<Predictions />);
    await waitFor(() => {
      expect(screen.getByText('Melbourne Storm v Penrith Panthers')).toBeInTheDocument();
    });
  });

  it('shows match count', async () => {
    vi.mocked(api.getPredictions).mockResolvedValueOnce(mockApiData);
    renderWithProviders(<Predictions />);
    await waitFor(() => {
      expect(screen.getByText('1 matches')).toBeInTheDocument();
    });
  });
});
