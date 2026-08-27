import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text,
  useWindowDimensions, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { api } from '../../../src/api/client';
import {
  GlassButton, GhostButton, GlassCard, Pill, ErrorNote, Shimmer,
} from '../../../src/components/Glass';
import { colors, radius, spacing, typography } from '../../../src/theme/tokens';

/**
 * Content player — video, PDF, image or link.
 *
 * Everything is rendered in place where the platform allows it, and handed to
 * the OS where it does not. A student who taps a lesson and lands in a browser
 * has left the app, and getting back is a step they will not always take.
 */
export default function ItemView() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.content.item(id);
      setData(r);
      setCompleted(r.item.progressStatus === 'completed');
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const item = data?.item;
  const url = item?.url?.startsWith('/') ? `${api.baseUrl}${item.url}` : item?.url;

  /**
   * Record that it was opened.
   *
   * Fire-and-forget: a failed progress write must never block or interrupt the
   * thing the student came here to do.
   */
  const openedRef = useRef(false);
  useEffect(() => {
    if (!item || openedRef.current) return;
    openedRef.current = true;
    api.content.progress(item.id, 'viewed', 0).catch(() => {});
  }, [item]);

  const markComplete = async () => {
    setSaving(true);
    try {
      await api.content.progress(item.id, 'completed', 0);
      setCompleted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // 16:9, capped so the player does not swallow a tall phone screen.
  const playerWidth = Math.min(width - spacing.lg * 2, 860);
  const playerHeight = Math.round(playerWidth * 0.5625);

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl }]}
    >
      <GhostButton title="← Back" onPress={() => router.back()} style={{ alignSelf: 'flex-start' }} />

      <Text style={styles.title}>{item?.title || 'Loading…'}</Text>
      <Text style={styles.meta}>
        {[data?.node?.title, item?.itemType].filter(Boolean).join(' · ')}
      </Text>

      <ErrorNote message={error} />

      {!data && !error && (
        <GlassCard style={{ marginTop: spacing.md }}>
          <Shimmer width={playerWidth - spacing.lg * 2} height={playerHeight / 2} />
        </GlassCard>
      )}

      {item && (
        <View style={{ marginTop: spacing.md }}>
          {item.itemType === 'video' && (
            <VideoPlayer url={url} width={playerWidth} height={playerHeight} />
          )}

          {item.itemType === 'image' && (
            <GlassCard padded={false}>
              <Image
                source={{ uri: url }}
                style={{ width: '100%', height: playerHeight }}
                resizeMode="contain"
                accessibilityLabel={item.title}
              />
            </GlassCard>
          )}

          {(item.itemType === 'pdf' || item.itemType === 'link') && (
            <Embedded url={url} height={playerHeight * 1.6} title={item.title} />
          )}

          {item.description ? (
            <GlassCard style={{ marginTop: spacing.md }}>
              <Text style={styles.description}>{item.description}</Text>
            </GlassCard>
          ) : null}

          <View style={styles.actions}>
            {completed ? (
              <View style={styles.doneRow}>
                <Pill label="✓ Completed" tone="active" />
                <GhostButton title="Back to the list" onPress={() => router.back()} />
              </View>
            ) : (
              <GlassButton title="Mark as completed" onPress={markComplete} loading={saving} />
            )}

            <GhostButton
              title="Open outside the app"
              onPress={() => Linking.openURL(url).catch(() => setError('Could not open this.'))}
            />
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Video ───────────────────────────────────────────────────────────────────

function VideoPlayer({ url, width, height }) {
  // expo-video's player is created once and kept; recreating it on every render
  // restarts playback from zero.
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    // No autoplay: a lesson that starts talking the moment the screen opens is
    // hostile in a classroom, and iOS blocks it with sound anyway.
    p.pause();
  });

  return (
    <GlassCard padded={false}>
      <VideoView
        player={player}
        style={{ width: '100%', height }}
        contentFit="contain"
        allowsFullscreen
        allowsPictureInPicture={false}
        nativeControls
      />
    </GlassCard>
  );
}

// ─── PDFs and links ──────────────────────────────────────────────────────────

/**
 * Render a document or page inline.
 *
 * On web this is an iframe — React Native Web renders to the DOM, so it is a
 * real one. On device it is a WebView. Some sites refuse to be framed
 * (X-Frame-Options), which shows as a blank box with no error, so the "Open
 * outside the app" button below is always available as the way out.
 */
function Embedded({ url, height, title }) {
  const [failed, setFailed] = useState(false);

  if (Platform.OS === 'web') {
    return (
      <GlassCard padded={false}>
        {React.createElement('iframe', {
          src: url,
          title,
          style: {
            width: '100%', height, border: 'none',
            borderRadius: radius.lg, background: '#fff',
          },
        })}
      </GlassCard>
    );
  }

  // Imported lazily so the web bundle never pulls in the native WebView.
  let WebView;
  try {
    // eslint-disable-next-line global-require
    ({ WebView } = require('react-native-webview'));
  } catch {
    WebView = null;
  }

  if (!WebView || failed) {
    return (
      <GlassCard>
        <Text style={styles.fallback}>
          This can't be shown inside the app. Use "Open outside the app" below.
        </Text>
      </GlassCard>
    );
  }

  // Android will not render a remote PDF on its own, so it goes through
  // Google's viewer; iOS renders one natively and needs no help.
  const src = Platform.OS === 'android' ? pdfProxy(url) : url;

  return (
    <GlassCard padded={false}>
      <WebView
        source={{ uri: src }}
        style={{ width: '100%', height, borderRadius: radius.lg }}
        onError={() => setFailed(true)}
      />
    </GlassCard>
  );
}

/**
 * Android's WebView has no built-in PDF renderer and shows a blank page or
 * triggers a download. Google's viewer handles it — at the cost of the file
 * being fetched by Google, so it only applies to PDFs, never to arbitrary links.
 */
const pdfProxy = (url) => (
  url?.toLowerCase().endsWith('.pdf')
    ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`
    : url
);

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, maxWidth: 900, width: '100%', alignSelf: 'center' },
  title: { ...typography.h2, color: colors.text, marginTop: spacing.sm },
  meta: { ...typography.small, color: colors.textFaint, marginTop: 2 },
  description: { ...typography.body, color: colors.textMuted, lineHeight: 21 },
  actions: { marginTop: spacing.lg, gap: spacing.sm },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, justifyContent: 'center' },
  fallback: { ...typography.small, color: colors.textMuted, textAlign: 'center' },
});
