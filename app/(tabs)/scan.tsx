import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import AppButton from '@/components/AppButton';
import { useAuth } from '@/lib/auth';
import { registerAttendance } from '@/lib/database';
import { useTheme, type AppColors } from '@/lib/theme';

export default function ScanScreen() {
  const { user } = useAuth();
  const { primary, colors } = useTheme();
  const styles = createStyles(colors);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [lastData, setLastData] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!permission) {
    return (
      <View style={styles.permissionScreen}>
        <ActivityIndicator color={primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionScreen}>
        <View style={styles.permissionCard}>
          <View style={[styles.permissionIcon, { backgroundColor: colors.accentSurface }]}>
            <Ionicons name="camera-outline" size={30} color={primary} />
          </View>
          <Text style={styles.permissionTitle}>Camera access needed</Text>
          <Text style={styles.permissionText}>
            Allow camera access to scan an event QR code and record your attendance.
          </Text>
          <AppButton
            theme="primary"
            title="Allow Camera Access"
            icon="camera-outline"
            onPress={requestPermission}
          />
        </View>
      </SafeAreaView>
    );
  }

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (!user) {
      setScanned(true);
      setMessage('You must be signed in to record attendance.');
      setSuccess(false);
      return;
    }

    setScanned(true);
    setLastData(data);
    registerAttendance(data, user.id).then((result) => {
      setMessage(result.message);
      setSuccess(result.success);
    }).catch(() => {
      setMessage('Could not record attendance. Please try again.');
      setSuccess(false);
    });
  };

  const handleScanAgain = () => {
    setScanned(false);
    setLastData(null);
    setMessage(null);
  };

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />

      <SafeAreaView style={styles.overlay}>
        <View style={styles.prompt}>
          <Text style={styles.promptTitle}>{scanned ? 'QR code detected' : 'Scan an event QR'}</Text>
          <Text style={styles.promptText}>
            {scanned ? 'Check the result below.' : 'Align the code inside the frame to check in.'}
          </Text>
        </View>

        {!scanned && (
          <View style={styles.frameArea}>
            <View style={styles.scanFrame}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
          </View>
        )}

        <View style={styles.bottomArea}>
          {scanned ? (
            <View style={styles.resultCard}>
              <View
                style={[
                  styles.resultIcon,
                  { backgroundColor: success ? '#E8F5E9' : '#FFEBEE' },
                ]}
              >
                <Ionicons
                  name={!message ? 'time-outline' : success ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                  size={25}
                  color={!message ? colors.tertiary : success ? '#2E7D32' : colors.danger}
                />
              </View>
              <Text style={[styles.resultTitle, success ? styles.success : styles.error]}>
                {message ?? 'Processing your attendance...'}
              </Text>
              {lastData && (
                <Text style={styles.scanData} numberOfLines={2}>
                  {lastData}
                </Text>
              )}
              <AppButton
                theme="primary"
                title="Scan Again"
                icon="refresh"
                onPress={handleScanAgain}
              />
            </View>
          ) : (
            <View style={styles.hintCard}>
              <Ionicons name="scan-outline" size={20} color={colors.accent} />
              <Text style={styles.hintText}>
                Hold steady. The code will be scanned automatically.
              </Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

function createStyles(colors: AppColors) {
 return StyleSheet.create({
  container: { flex: 1, backgroundColor: '#101820' },
  permissionScreen: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: 24,
  },
  permissionCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderLeftColor: colors.accent,
    borderLeftWidth: 3,
    padding: 24,
  },
  permissionIcon: {
    alignItems: 'center',
    borderRadius: 3,
    height: 64,
    justifyContent: 'center',
    marginBottom: 16,
    width: 64,
  },
  permissionTitle: {
    color: colors.textPrimary,
    fontSize: 21,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  permissionText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
    textAlign: 'center',
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 12,
  },
  prompt: {
    alignSelf: 'center',
    backgroundColor: 'rgba(13, 27, 42, 0.72)',
    borderLeftColor: colors.accent,
    borderLeftWidth: 3,
    maxWidth: 320,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  promptTitle: {
    color: colors.textOnPrimary,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  promptText: {
    color: colors.textOnPrimary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
    opacity: 0.9,
    textAlign: 'center',
  },
  frameArea: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  scanFrame: {
    borderColor: 'rgba(255, 255, 255, 0.45)',
    borderRadius: 3,
    borderWidth: 1,
    height: 250,
    maxWidth: '100%',
    width: 250,
  },
  corner: {
    borderColor: colors.tertiary,
    height: 34,
    position: 'absolute',
    width: 34,
  },
  topLeft: { borderLeftWidth: 5, borderTopWidth: 5, borderTopLeftRadius: 10, left: -2, top: -2 },
  topRight: { borderRightWidth: 5, borderTopWidth: 5, borderTopRightRadius: 10, right: -2, top: -2 },
  bottomLeft: { borderBottomWidth: 5, borderLeftWidth: 5, borderBottomLeftRadius: 10, bottom: -2, left: -2 },
  bottomRight: { borderBottomWidth: 5, borderRightWidth: 5, borderBottomRightRadius: 10, bottom: -2, right: -2 },
  bottomArea: { width: '100%' },
  hintCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderLeftColor: colors.accent,
    borderLeftWidth: 3,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  hintText: { color: colors.textPrimary, flex: 1, fontSize: 13, lineHeight: 18 },
  resultCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderTopColor: colors.accent,
    borderTopWidth: 3,
    padding: 18,
  },
  resultIcon: {
    alignItems: 'center',
    borderRadius: 15,
    height: 48,
    justifyContent: 'center',
    marginBottom: 10,
    width: 48,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 5,
    textAlign: 'center',
  },
  success: { color: '#2E7D32' },
  error: { color: colors.danger },
  scanData: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 10,
    textAlign: 'center',
  },
 });
}
