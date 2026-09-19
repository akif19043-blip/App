'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GameClient } from '@/game/gameClient';
import { audioBus } from '@/game/audio';
import { hudStore } from '@/game/store';
import { loadSettings } from '@/lib/settings';
import { Hud } from '@/components/hud/Hud';

export interface RaidClientProps {
  endpoint: string;
  mapId: string;
  loadoutId: string | null;
  accessToken: string | null;
  demoUserId: string | null;
  demoUsername: string | null;
}

/**
 * Mounts the WebGL canvas and the React HUD.
 *
 * The game loop lives entirely inside `GameClient`; this component only owns
 * the canvas element, the lifecycle and the handful of actions the HUD can
 * trigger. React never renders per frame.
 */
export function RaidClient(props: RaidClientProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const clientRef = useRef<GameClient | null>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || clientRef.current) return;

    hudStore.reset();
    const settings = loadSettings();
    audioBus.setEnabled(settings.audioEnabled);
    audioBus.setVolume(settings.audioVolume);

    const client = new GameClient({
      canvas,
      endpoint: props.endpoint,
      mapId: props.mapId,
      loadoutId: props.loadoutId,
      accessToken: props.accessToken ?? undefined,
      demoUserId: props.demoUserId ?? undefined,
      demoUsername: props.demoUsername ?? undefined,
      sensitivity: settings.sensitivity,
      invertY: settings.invertY,
      audioEnabled: settings.audioEnabled,
      audioVolume: settings.audioVolume,
      onDisconnect: (reason) => setError(reason),
    });
    clientRef.current = client;

    client
      .start()
      .then(() => setStarted(true))
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Failed to join a raid.');
      });

    return () => {
      clientRef.current = null;
      void client.stop();
    };
  }, [props.accessToken, props.demoUserId, props.demoUsername, props.endpoint, props.loadoutId, props.mapId]);

  const onReturnToMenu = useCallback(() => {
    void clientRef.current?.stop();
    router.push('/menu');
  }, [router]);

  return (
    <div className="fixed inset-0 z-20 bg-void">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <Hud
        client={clientRef}
        started={started}
        error={error}
        onReturnToMenu={onReturnToMenu}
      />
    </div>
  );
}
