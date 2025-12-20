'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { connectSocket } from '@/lib/socket';

export default function HomePage() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    setIsLoading(true);
    setError('');

    const socket = connectSocket();

    socket.once('cc:room-created', ({ roomCode }: { roomCode: string }) => {
      // Store player info in session storage
      sessionStorage.setItem('playerName', playerName);
      sessionStorage.setItem('playerId', socket.id || '');
      router.push(`/world/${roomCode}`);
    });

    socket.once('cc:error', ({ message }: { message: string }) => {
      setError(message);
      setIsLoading(false);
    });

    socket.emit('cc:create-room', { playerName });
  };

  const handleJoin = async () => {
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!roomCode.trim()) {
      setError('Please enter a room code');
      return;
    }

    setIsLoading(true);
    setError('');

    const socket = connectSocket();

    socket.once('cc:room-joined', ({ roomCode: code }: { roomCode: string }) => {
      sessionStorage.setItem('playerName', playerName);
      sessionStorage.setItem('playerId', socket.id || '');
      router.push(`/world/${code}`);
    });

    socket.once('cc:error', ({ message }: { message: string }) => {
      setError(message);
      setIsLoading(false);
    });

    socket.emit('cc:join-room', { roomCode: roomCode.toUpperCase(), playerName });
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-b from-sky-400 to-sky-200">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-4xl font-bold text-center mb-2">
          <span className="text-6xl">🤡</span>
        </h1>
        <h2 className="text-2xl font-bold text-center mb-8 text-gray-800">
          Clown Club
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Your Name
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength={20}
              disabled={isLoading}
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={isLoading}
            className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition disabled:opacity-50"
          >
            {isLoading ? 'Creating...' : 'Create Room'}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">or join existing</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Room Code
            </label>
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="XXXX"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase text-center text-2xl tracking-widest"
              maxLength={4}
              disabled={isLoading}
            />
          </div>

          <button
            onClick={handleJoin}
            disabled={isLoading}
            className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition disabled:opacity-50"
          >
            {isLoading ? 'Joining...' : 'Join Room'}
          </button>
        </div>
      </div>

      <p className="mt-8 text-white/80 text-sm">
        A Club Penguin-style virtual world
      </p>
    </main>
  );
}
