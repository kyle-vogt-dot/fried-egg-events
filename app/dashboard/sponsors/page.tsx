'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function SponsorsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const eventId = searchParams.get('eventId');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // ==================== STATE ====================
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<'tournament' | 'hole' | 'team'>('tournament');

  // Tournament Sponsor
  const [tournamentPackages, setTournamentPackages] = useState<any[]>([]);

  // Hole Sponsor
  const [holeSponsorships, setHoleSponsorships] = useState<any[]>([]);

  // Team/Player Sponsor
  const [teamSponsorships, setTeamSponsorships] = useState<any[]>([]);

  // Quick Add for Hole Sponsor
  const [newHoleRange, setNewHoleRange] = useState('');
  const [newHolePrice, setNewHolePrice] = useState('');
  const [newHoleDescription, setNewHoleDescription] = useState('');

  // ==================== FETCH DATA ====================
  useEffect(() => {
    if (!eventId) {
      router.push('/dashboard');
      return;
    }
    setLoading(false);
  }, [eventId, router]);

  // ==================== TOURNAMENT SPONSOR ====================
  const addTournamentPackage = () => {
    setTournamentPackages([...tournamentPackages, { name: '', price: '', description: '' }]);
  };

  const updateTournamentPackage = (index: number, field: string, value: any) => {
    const updated = [...tournamentPackages];
    updated[index][field] = value;
    setTournamentPackages(updated);
  };

  const removeTournamentPackage = (index: number) => {
    setTournamentPackages(tournamentPackages.filter((_, i) => i !== index));
  };

  // ==================== HOLE SPONSOR ====================
  const addMultipleHoles = () => {
    if (!newHoleRange.trim()) {
      alert("Please enter hole numbers (e.g. 1-5 or 3,7,12)");
      return;
    }
    if (!newHolePrice) {
      alert("Please enter a price per hole");
      return;
    }

    const holeNumbers = parseHoleRange(newHoleRange);
    const price = parseFloat(newHolePrice);

    const newEntries = holeNumbers.map(holeNum => ({
      hole_number: holeNum.toString(),
      price: price,
      description: newHoleDescription
    }));

    setHoleSponsorships([...holeSponsorships, ...newEntries]);

    setNewHoleRange('');
    setNewHolePrice('');
    setNewHoleDescription('');
    
    alert(`Added ${holeNumbers.length} hole sponsorship(s)!`);
  };

  const parseHoleRange = (range: string): number[] => {
    const holes: number[] = [];
    const parts = range.split(',');

    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.includes('-')) {
        const [start, end] = trimmed.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
            holes.push(i);
          }
        }
      } else {
        const num = parseInt(trimmed);
        if (!isNaN(num)) holes.push(num);
      }
    }
    return holes;
  };

  const removeHoleSponsorship = (index: number) => {
    setHoleSponsorships(holeSponsorships.filter((_, i) => i !== index));
  };

  // ==================== TEAM / PLAYER SPONSOR ====================
  const addTeamSponsorship = () => {
    setTeamSponsorships([...teamSponsorships, { description: '', min_price: '' }]);
  };

  const updateTeamSponsorship = (index: number, field: string, value: any) => {
    const updated = [...teamSponsorships];
    updated[index][field] = value;
    setTeamSponsorships(updated);
  };

  const removeTeamSponsorship = (index: number) => {
    setTeamSponsorships(teamSponsorships.filter((_, i) => i !== index));
  };

  if (loading) return <div className="p-10 text-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <h1 className="text-4xl font-bold">Sponsors Management</h1>
          <button 
            onClick={() => router.push('/dashboard')}
            className="text-gray-400 hover:text-white flex items-center gap-2"
          >
            ← Back to Dashboard
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-10 border-b border-gray-700 pb-1">
          <button 
            onClick={() => setActiveType('tournament')}
            className={`px-8 py-3 rounded-2xl font-medium transition-colors ${
              activeType === 'tournament' ? 'bg-amber-600 text-white' : 'bg-gray-800 hover:bg-gray-700'
            }`}
          >
            Tournament Sponsor
          </button>
          <button 
            onClick={() => setActiveType('hole')}
            className={`px-8 py-3 rounded-2xl font-medium transition-colors ${
              activeType === 'hole' ? 'bg-amber-600 text-white' : 'bg-gray-800 hover:bg-gray-700'
            }`}
          >
            Sponsor Hole
          </button>
          <button 
            onClick={() => setActiveType('team')}
            className={`px-8 py-3 rounded-2xl font-medium transition-colors ${
              activeType === 'team' ? 'bg-amber-600 text-white' : 'bg-gray-800 hover:bg-gray-700'
            }`}
          >
            Sponsor Team/Player
          </button>
        </div>

        {/* ==================== TOURNAMENT SPONSOR ==================== */}
        {activeType === 'tournament' && (
          <div className="bg-gray-800 rounded-3xl p-10">
            <h2 className="text-2xl font-semibold mb-8">Tournament Sponsor Packages</h2>
            <div className="space-y-6">
              {tournamentPackages.map((pkg, index) => (
                <div key={index} className="bg-gray-900 p-8 rounded-3xl">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    <div className="md:col-span-4">
                      <label className="block text-sm text-gray-400 mb-2">Package Name</label>
                      <input
                        value={pkg.name}
                        onChange={(e) => updateTournamentPackage(index, 'name', e.target.value)}
                        placeholder="Bronze Sponsor"
                        className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-sm text-gray-400 mb-2">Price ($)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={pkg.price}
                        onChange={(e) => updateTournamentPackage(index, 'price', e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4"
                      />
                    </div>
                    <div className="md:col-span-5">
                      <label className="block text-sm text-gray-400 mb-2">Description</label>
                      <input
                        value={pkg.description}
                        onChange={(e) => updateTournamentPackage(index, 'description', e.target.value)}
                        placeholder="Includes logo on website and signage"
                        className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => removeTournamentPackage(index)}
                    className="mt-4 text-red-400 hover:text-red-500 text-sm"
                  >
                    Remove Package
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={addTournamentPackage}
              className="mt-8 w-full py-4 border border-dashed border-gray-600 rounded-2xl text-gray-400 hover:text-white"
            >
              + Add Another Package
            </button>
          </div>
        )}

        {/* ==================== HOLE SPONSOR ==================== */}
        {activeType === 'hole' && (
          <div className="bg-gray-800 rounded-3xl p-10">
            <h2 className="text-2xl font-semibold mb-8">Sponsor a Hole</h2>
            <p className="text-gray-400 mb-8">Quickly sponsor multiple holes at once.</p>

            <div className="bg-gray-900 p-8 rounded-3xl mb-10">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="md:col-span-4">
                  <label className="block text-sm text-gray-400 mb-2">Holes (e.g. 1-5 or 3,7,12)</label>
                  <input
                    type="text"
                    value={newHoleRange}
                    onChange={(e) => setNewHoleRange(e.target.value)}
                    placeholder="1-5 or 3,7,12"
                    className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4"
                  />
                </div>
                <div className="md:col-span-4">
                  <label className="block text-sm text-gray-400 mb-2">Price per Hole ($)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={newHolePrice}
                    onChange={(e) => setNewHolePrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4"
                  />
                </div>
                <div className="md:col-span-4">
                  <label className="block text-sm text-gray-400 mb-2">Description / Benefits</label>
                  <input
                    value={newHoleDescription}
                    onChange={(e) => setNewHoleDescription(e.target.value)}
                    placeholder="Includes tee sign and shoutout on leaderboard"
                    className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4"
                  />
                </div>
              </div>

              <button
                onClick={addMultipleHoles}
                className="mt-6 w-full bg-amber-600 hover:bg-amber-700 py-4 rounded-2xl font-semibold"
              >
                Add These Hole Sponsorships
              </button>
            </div>

            <h3 className="text-lg font-medium mb-4">Added Hole Sponsorships</h3>
            <div className="space-y-4">
              {holeSponsorships.length === 0 ? (
                <p className="text-gray-400 py-8 text-center">No hole sponsorships added yet.</p>
              ) : (
                holeSponsorships.map((hole, index) => (
                  <div key={index} className="bg-gray-900 p-6 rounded-3xl flex justify-between items-center">
                    <div>
                      <span className="font-medium">Hole {hole.hole_number}</span>
                      <span className="ml-6 text-emerald-400">${hole.price}</span>
                      <span className="ml-6 text-gray-400 text-sm">{hole.description}</span>
                    </div>
                    <button
                      onClick={() => removeHoleSponsorship(index)}
                      className="text-red-400 hover:text-red-500"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ==================== TEAM / PLAYER SPONSOR ==================== */}
        {activeType === 'team' && (
          <div className="bg-gray-800 rounded-3xl p-10">
            <h2 className="text-2xl font-semibold mb-8">Sponsor a Team or Player</h2>
            <p className="text-gray-400 mb-8">Sponsors can support a specific team or player.</p>

            <div className="space-y-6">
              {teamSponsorships.map((team, index) => (
                <div key={index} className="bg-gray-900 p-8 rounded-3xl">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Description</label>
                    <input
                      value={team.description}
                      onChange={(e) => updateTeamSponsorship(index, 'description', e.target.value)}
                      placeholder="Sponsor a team - includes team jersey logo, shoutout, etc."
                      className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4"
                    />
                  </div>
                  <div className="mt-6">
                    <label className="block text-sm text-gray-400 mb-2">Minimum Sponsorship Amount ($)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={team.min_price}
                      onChange={(e) => updateTeamSponsorship(index, 'min_price', e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4"
                    />
                  </div>
                  <button
                    onClick={() => removeTeamSponsorship(index)}
                    className="mt-6 text-red-400 hover:text-red-500 text-sm"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={addTeamSponsorship}
              className="mt-8 w-full py-4 border border-dashed border-gray-600 rounded-2xl text-gray-400 hover:text-white"
            >
              + Add Team/Player Sponsorship Option
            </button>
          </div>
        )}
      </div>
    </div>
  );
}