import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { io, Socket } from 'socket.io-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') || 'http://localhost:3000';

interface GuildSummary {
  id: string;
  name: string;
  icon?: string | null;
}

interface TrackSummary {
  title: string;
  author: string;
  uri: string;
  duration: number;
  thumbnail?: string | null;
}

interface PlayerStatus {
  isPlaying: boolean;
  paused: boolean;
  currentTrack: TrackSummary | null;
  queue: TrackSummary[];
  volume: number;
  voiceChannel?: string | null;
  loopMode?: 'off' | 'track' | 'queue';
  autoplay?: boolean;
  mode247?: boolean;
  filterPreset?: string;
  position?: number;
}

interface ChannelSummary {
  id: string;
  name: string;
}

interface GuildChannels {
  voiceChannels: ChannelSummary[];
  textChannels: ChannelSummary[];
}

type ApiResponse<T> = {
  success: boolean;
  error?: string;
} & T;

function formatDuration(ms: number | null | undefined) {
  if (!ms || Number.isNaN(ms)) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function useSocket(guildId: string | null, refreshStatus: () => void, refreshQueue: () => void) {
  useEffect(() => {
    if (!guildId) return;

    let socket: Socket | null = null;

    socket = io(API_BASE_URL, {
      withCredentials: true,
      transports: ['websocket']
    });

    socket.on('connect', () => {
      socket?.emit('subscribe', guildId);
    });

    socket.on('queueUpdate', () => {
      refreshQueue();
      refreshStatus();
    });

    socket.on('playerUpdate', () => {
      refreshStatus();
    });

    return () => {
      socket?.disconnect();
    };
  }, [guildId, refreshQueue, refreshStatus]);
}

export default function Dashboard() {
  const [servers, setServers] = useState<GuildSummary[]>([]);
  const [selectedGuild, setSelectedGuild] = useState<string>('');
  const [status, setStatus] = useState<PlayerStatus | null>(null);
  const [queue, setQueue] = useState<TrackSummary[]>([]);
  const [channels, setChannels] = useState<GuildChannels | null>(null);
  const [voiceChannelId, setVoiceChannelId] = useState<string>('');
  const [textChannelId, setTextChannelId] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [authRequired, setAuthRequired] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  const apiFetch = useCallback(async <T,>(path: string, init?: RequestInit): Promise<ApiResponse<T> | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        ...init
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        setAuthRequired(true);
        return null;
      }

      const data = (await response.json()) as ApiResponse<T>;
      if (!data.success) {
        setError(typeof data.error === 'string' ? data.error : 'Operação falhou');
      }
      return data;
    } catch (err) {
      console.error(err);
      setError('Não foi possível comunicar com o servidor.');
      return null;
    }
  }, []);

  const fetchServers = useCallback(async () => {
    setError('');
    const data = await apiFetch<{ servers: GuildSummary[] }>('/api/servers');
    if (data?.success && Array.isArray(data.servers)) {
      setServers(data.servers);
      if (data.servers.length > 0 && !selectedGuild) {
        setSelectedGuild(data.servers[0].id);
      }
    }
  }, [apiFetch, selectedGuild]);

  const fetchStatus = useCallback(async () => {
    if (!selectedGuild) return;
    const data = await apiFetch<{ status: PlayerStatus }>(`/api/status/${selectedGuild}`);
    if (data?.success && data.status) {
      setStatus(data.status);
    }
  }, [apiFetch, selectedGuild]);

  const fetchQueue = useCallback(async () => {
    if (!selectedGuild) return;
    const data = await apiFetch<{ queue: { current: TrackSummary | null; upcoming: TrackSummary[] } }>(`/api/queue/${selectedGuild}`);
    if (data?.success && data.queue) {
      const { current, upcoming } = data.queue;
      const mergedQueue = [current, ...(upcoming || [])].filter(Boolean) as TrackSummary[];
      setQueue(mergedQueue);
    }
  }, [apiFetch, selectedGuild]);

  const fetchChannels = useCallback(async () => {
    if (!selectedGuild) return;
    const data = await apiFetch<GuildChannels>(`/api/guild/${selectedGuild}/channels`);
    if (data?.success) {
      const voiceChannels = (data.voiceChannels as ChannelSummary[]) || [];
      const textChannels = (data.textChannels as ChannelSummary[]) || [];
      setChannels({ voiceChannels, textChannels });
      if (!voiceChannelId && voiceChannels.length > 0) {
        setVoiceChannelId(voiceChannels[0].id);
      }
      if (!textChannelId && textChannels.length > 0) {
        setTextChannelId(textChannels[0].id);
      }
    }
  }, [apiFetch, selectedGuild, textChannelId, voiceChannelId]);

  const refresh = useCallback(() => {
    fetchStatus();
    fetchQueue();
  }, [fetchQueue, fetchStatus]);

  useSocket(selectedGuild || null, refresh, fetchQueue);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  useEffect(() => {
    if (!selectedGuild) return;
    fetchStatus();
    fetchQueue();
    fetchChannels();
    setMessage('');
    setError('');
  }, [selectedGuild, fetchStatus, fetchQueue, fetchChannels]);

  const current = status?.currentTrack || null;
  const loginUrl = `${API_BASE_URL}/login`;

  const handleAction = useCallback(
    async (path: string, body?: Record<string, unknown>) => {
      if (!selectedGuild) return;
      setLoading(true);
      setMessage('');
      setError('');

      const response = await apiFetch(path, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined
      });

      setLoading(false);

      if (response?.success) {
        refresh();
        return true;
      }

      return false;
    },
    [apiFetch, refresh, selectedGuild]
  );

  const handlePlay = useCallback(async () => {
    if (!selectedGuild || !query.trim() || !voiceChannelId) {
      setError('Preencha o termo de busca e canal de voz.');
      return;
    }

    const ok = await handleAction(`/api/play/${selectedGuild}`, {
      query,
      voiceChannelId,
      textChannelId
    });

    if (ok) {
      setQuery('');
      setMessage('Música adicionada com sucesso.');
    }
  }, [handleAction, query, selectedGuild, textChannelId, voiceChannelId]);

  const loopMode = status?.loopMode || 'off';
  const autoplay = status?.autoplay ?? false;
  const mode247 = status?.mode247 ?? false;
  const filterPreset = status?.filterPreset || 'off';

  return (
    <>
      <Head>
        <title>MusicMaestro Dashboard</title>
      </Head>
      <main style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '2.25rem', fontWeight: 700 }}>MusicMaestro Dashboard</h1>
            <p style={{ color: '#94a3b8' }}>Controle seu bot diretamente do navegador.</p>
          </div>
          <div>
            <button
              onClick={fetchServers}
              style={{ padding: '8px 12px', background: '#2563eb', border: 'none', borderRadius: '6px', color: '#fff', marginRight: '12px' }}
            >
              Atualizar servidores
            </button>
            <a
              href={`${API_BASE_URL}/logout`}
              style={{ padding: '8px 12px', border: '1px solid #334155', borderRadius: '6px', color: '#cbd5f5' }}
            >
              Logout
            </a>
          </div>
        </header>

        {authRequired && (
          <div style={{ background: '#13213c', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
            <p>Você precisa autenticar-se para usar o dashboard.</p>
            <a href={loginUrl} style={{ color: '#60a5fa', textDecoration: 'underline' }}>
              Clique aqui para entrar com Discord
            </a>
          </div>
        )}

        {error && (
          <div style={{ background: '#3f1d2b', border: '1px solid #7f1d1d', borderRadius: '8px', padding: '16px', marginBottom: '16px', color: '#fecaca' }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{ background: '#1f2937', border: '1px solid #10b981', borderRadius: '8px', padding: '16px', marginBottom: '16px', color: '#bbf7d0' }}>
            {message}
          </div>
        )}

        <section style={{ marginBottom: '24px' }}>
          <label htmlFor="guild" style={{ display: 'block', marginBottom: '8px' }}>Servidor</label>
          <select
            id="guild"
            value={selectedGuild}
            onChange={(event) => setSelectedGuild(event.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0' }}
          >
            {servers.map((guild) => (
              <option key={guild.id} value={guild.id}>
                {guild.name}
              </option>
            ))}
          </select>
        </section>

        <div style={{ display: 'grid', gap: '24px', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          <section style={{ background: '#111c35', borderRadius: '12px', padding: '20px', border: '1px solid #1e293b' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '16px' }}>Status do Player</h2>
            {status?.currentTrack ? (
              <div>
                <div style={{ display: 'flex', gap: '16px' }}>
                  {status.currentTrack.thumbnail && (
                    <Image
                      src={status.currentTrack.thumbnail}
                      alt={status.currentTrack.title}
                      width={160}
                      height={90}
                      style={{ borderRadius: '8px', objectFit: 'cover' }}
                    />
                  )}
                  <div>
                    <h3 style={{ fontSize: '1.125rem', marginBottom: '8px' }}>{status.currentTrack.title}</h3>
                    <p style={{ color: '#94a3b8', marginBottom: '4px' }}>{status.currentTrack.author}</p>
                    <p style={{ color: '#94a3b8', marginBottom: '4px' }}>
                      {formatDuration(status.position ? status.position * 1000 : 0)} / {formatDuration(status.currentTrack.duration)}
                    </p>
                    <p style={{ color: status.paused ? '#fbbf24' : '#34d399' }}>
                      {status.paused ? '⏸️ Pausado' : status.isPlaying ? '▶️ Reproduzindo' : '⏹️ Parado'}
                    </p>
                    <p style={{ color: '#94a3b8' }}>Volume: {status.volume}%</p>
                    <p style={{ color: '#94a3b8' }}>Loop: {loopMode}</p>
                    <p style={{ color: '#94a3b8' }}>Filtro: {filterPreset}</p>
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ color: '#94a3b8' }}>Nada está tocando no momento.</p>
            )}
          </section>

          <section style={{ background: '#111c35', borderRadius: '12px', padding: '20px', border: '1px solid #1e293b' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '16px' }}>Adicionar Música</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="text"
                placeholder="Nome da música ou URL"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                style={{ padding: '10px', borderRadius: '6px', border: '1px solid #1e293b', background: '#0f172a', color: '#e2e8f0' }}
              />
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor="voiceChannel" style={{ display: 'block', marginBottom: '6px', color: '#94a3b8' }}>Canal de Voz</label>
                  <select
                    id="voiceChannel"
                    value={voiceChannelId}
                    onChange={(event) => setVoiceChannelId(event.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0' }}
                  >
                    {(channels?.voiceChannels || []).map((channel) => (
                      <option key={channel.id} value={channel.id}>{channel.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="textChannel" style={{ display: 'block', marginBottom: '6px', color: '#94a3b8' }}>Canal de Texto</label>
                  <select
                    id="textChannel"
                    value={textChannelId}
                    onChange={(event) => setTextChannelId(event.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0' }}
                  >
                    {(channels?.textChannels || []).map((channel) => (
                      <option key={channel.id} value={channel.id}>{channel.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                onClick={handlePlay}
                disabled={loading}
                style={{ padding: '12px', borderRadius: '8px', background: '#22c55e', color: '#0f172a', border: 'none', fontWeight: 600 }}
              >
                {loading ? 'Processando...' : 'Adicionar à fila'}
              </button>
            </div>
          </section>
        </div>

        <section style={{ marginTop: '32px', background: '#111c35', borderRadius: '12px', padding: '20px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '16px' }}>Fila</h2>
          {queue.length === 0 ? (
            <p style={{ color: '#94a3b8' }}>A fila está vazia.</p>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {queue.map((track, index) => (
                <div key={`${track.uri}-${index}`} style={{ background: '#0f172a', borderRadius: '8px', padding: '12px', border: '1px solid #1e293b' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{index === 0 ? 'Tocando agora' : `#${index}`}</strong>
                      <p style={{ color: '#e2e8f0' }}>{track.title}</p>
                      <p style={{ color: '#94a3b8' }}>{track.author}</p>
                    </div>
                    <div style={{ textAlign: 'right', color: '#94a3b8' }}>
                      <p>{formatDuration(track.duration)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={{ marginTop: '32px', background: '#111c35', borderRadius: '12px', padding: '20px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '16px' }}>Controles</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <button onClick={() => handleAction(`/api/toggle/${selectedGuild}`)} style={controlButtonStyle}>Pausar/Retomar</button>
            <button onClick={() => handleAction(`/api/skip/${selectedGuild}`)} style={controlButtonStyle}>Pular</button>
            <button onClick={() => handleAction(`/api/stop/${selectedGuild}`)} style={controlButtonStyle}>Parar</button>
          </div>

          <div style={{ marginTop: '18px', display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <ControlCard title="Loop">
              <ToggleGroup
                value={loopMode}
                options={[
                  { label: 'Off', value: 'off' },
                  { label: 'Faixa', value: 'track' },
                  { label: 'Fila', value: 'queue' }
                ]}
                onChange={(value) => handleAction(`/api/loop/${selectedGuild}`, { mode: value })}
              />
            </ControlCard>

            <ControlCard title="Filtro">
              <ToggleGroup
                value={filterPreset}
                options={[
                  { label: 'Off', value: 'off' },
                  { label: 'Bass', value: 'bassboost' },
                  { label: 'Nightcore', value: 'nightcore' },
                  { label: 'Vaporwave', value: 'vaporwave' },
                  { label: 'Karaoke', value: 'karaoke' }
                ]}
                onChange={(value) => handleAction(`/api/filter/${selectedGuild}`, { preset: value })}
              />
            </ControlCard>

            <ControlCard title="Autoplay">
              <SwitchToggle
                active={autoplay}
                onToggle={(value) => handleAction(`/api/autoplay/${selectedGuild}`, { enabled: value })}
              />
            </ControlCard>

            <ControlCard title="Modo 24/7">
              <SwitchToggle
                active={mode247}
                onToggle={(value) => handleAction(`/api/twentyfourseven/${selectedGuild}`, { enabled: value })}
              />
            </ControlCard>

            <ControlCard title="Seek (segundos)">
              <SeekForm
                onSubmit={(seconds) => handleAction(`/api/seek/${selectedGuild}`, { seconds })}
                forward={(seconds) => handleAction(`/api/forward/${selectedGuild}`, { seconds })}
                rewind={(seconds) => handleAction(`/api/rewind/${selectedGuild}`, { seconds })}
              />
            </ControlCard>
          </div>
        </section>
      </main>
    </>
  );
}

const controlButtonStyle: CSSProperties = {
  padding: '10px 14px',
  borderRadius: '8px',
  border: '1px solid #1e293b',
  background: '#1d4ed8',
  color: '#e2e8f0',
  fontWeight: 600
};

function ControlCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ background: '#0f172a', borderRadius: '10px', padding: '16px', border: '1px solid #1e293b' }}>
      <h3 style={{ fontSize: '1.125rem', marginBottom: '12px' }}>{title}</h3>
      {children}
    </div>
  );
}

function ToggleGroup({
  value,
  options,
  onChange
}: {
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid #1e293b',
            background: value === option.value ? '#22c55e' : '#1e293b',
            color: value === option.value ? '#0f172a' : '#e2e8f0',
            fontWeight: 600
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SwitchToggle({ active, onToggle }: { active: boolean; onToggle: (value: boolean) => void }) {
  return (
    <button
      onClick={() => onToggle(!active)}
      style={{
        width: '80px',
        padding: '10px',
        borderRadius: '999px',
        border: '1px solid #1e293b',
        background: active ? '#22c55e' : '#1e293b',
        color: active ? '#0f172a' : '#e2e8f0',
        fontWeight: 600
      }}
    >
      {active ? 'ON' : 'OFF'}
    </button>
  );
}

function SeekForm({
  onSubmit,
  forward,
  rewind
}: {
  onSubmit: (seconds: number) => void;
  forward: (seconds: number) => void;
  rewind: (seconds: number) => void;
}) {
  const [value, setValue] = useState<number>(30);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(event) => setValue(Number(event.target.value))}
        style={{ padding: '8px', borderRadius: '6px', border: '1px solid #1e293b', background: '#0f172a', color: '#e2e8f0' }}
      />
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={() => rewind(value)} style={{ ...controlButtonStyle, flex: 1 }}>Rewind</button>
        <button onClick={() => onSubmit(value)} style={{ ...controlButtonStyle, flex: 1 }}>Seek</button>
        <button onClick={() => forward(value)} style={{ ...controlButtonStyle, flex: 1 }}>Forward</button>
      </div>
    </div>
  );
}
