import React, { useState, useEffect } from 'react';
import { SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View, FlatList, Alert, Modal, ScrollView, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
// @ts-ignore
import Ping from 'react-native-ping';
import notifee, { AndroidImportance, AndroidCategory, AuthorizationStatus, AndroidVisibility } from '@notifee/react-native';

const STORAGE_KEY = '@pinger_ip_list';
const LOGS_KEY = '@pinger_ping_logs';

interface IpItem {
  id: string;
  address: string;
  status: string; 
  lastChecked?: string;
  isPaused: boolean;
}

interface PingLog {
  id: string;
  ipAddress: string;
  status: 'Başarılı 🟢' | 'Başarısız 🔴';
  timestamp: string;
  isError: boolean;
}

let isServiceGloballyRunning = false;
let globalTimeoutId: NodeJS.Timeout | null = null;
let wakeUpFunction: ((value?: unknown) => void) | null = null;

const cleanOldLogs = (logs: PingLog[]): PingLog[] => {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return logs.filter(log => parseInt(log.id) > sevenDaysAgo);
};

// İşlemciyi dondurmayan (ANR önleyici) güvenli bekleme fonksiyonu
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const safePing = (ip: string, timeoutMs: number): Promise<number> => {
  return new Promise((resolve, reject) => {
    let isResolved = false;
    const failSafeTimer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        reject(new Error('Ping Timeout'));
      }
    }, timeoutMs + 1000);

    Ping.start(ip, { timeout: timeoutMs })
      .then((ms: number) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(failSafeTimer);
          resolve(ms);
        }
      })
      .catch((err: any) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(failSafeTimer);
          reject(err);
        }
      });
  });
};

notifee.registerForegroundService((notification) => {
  return new Promise(async (resolve) => {
    while (isServiceGloballyRunning) {
      try {
        const jsonValue = await AsyncStorage.getItem(STORAGE_KEY);
        const logsValue = await AsyncStorage.getItem(LOGS_KEY);
        
        if (jsonValue && isServiceGloballyRunning) {
          const currentList: IpItem[] = JSON.parse(jsonValue);
          let existingLogs: PingLog[] = logsValue ? JSON.parse(logsValue) : [];
          let failedIps: string[] = [];
          
          const date = new Date();
          const timestamp = `${date.toLocaleDateString('tr-TR')}, ${date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;

          for (let item of currentList) {
            if (!isServiceGloballyRunning) break;
            if (item.isPaused) continue; 

            let logStatus: 'Başarılı 🟢' | 'Başarısız 🔴' = 'Başarılı 🟢';
            let isError = false;
            try {
              const ms = await safePing(item.address, 2000);
              item.status = `Çevrimiçi 🟢 (${ms}ms)`;
            } catch (error) {
              item.status = 'Çevrimdışı 🔴';
              failedIps.push(item.address);
              logStatus = 'Başarısız 🔴';
              isError = true;
            }
            item.lastChecked = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

            existingLogs.push({ id: Date.now().toString() + Math.random().toString(), ipAddress: item.address, status: logStatus, timestamp: timestamp, isError: isError });

            // ANR ENGELLEYİCİ: Her pingden sonra işlemciye kesinlikle nefes aldır!
            await delay(1500); 
          }

          if (isServiceGloballyRunning) {
            existingLogs = cleanOldLogs(existingLogs);
            await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(existingLogs));
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(currentList));

            if (failedIps.length > 0) {
              await notifee.displayNotification({
                id: 'siren_alert_critical',
                title: '🚨 ACİL DURUM: SİSTEM ÇEVRİMDIŞI!',
                body: `${failedIps.join(', ')} adreslerine ulaşılamıyor!`,
                android: {
                  channelId: 'siren_channel_final',
                  importance: AndroidImportance.HIGH,
                  category: AndroidCategory.ALARM,
                  visibility: AndroidVisibility.PUBLIC,
                  sound: 'siren',
                  vibrationPattern: [300, 500, 300, 500],
                  pressAction: { id: 'default' },
                },
              });
            }
          }
        }
      } catch (e) {
        console.log('Servis hatası:', e);
      }

      if (isServiceGloballyRunning) {
        await new Promise((r) => {
          wakeUpFunction = r; 
          globalTimeoutId = setTimeout(r, 300000); // 5 Dakika
        });
      }
    }
    resolve(undefined); 
  });
});

const App = () => {
  const [ipAddress, setIpAddress] = useState('');
  const [ipList, setIpList] = useState<IpItem[]>([]);
  const [allLogs, setAllLogs] = useState<PingLog[]>([]);
  const [selectedIpLogs, setSelectedIpLogs] = useState<PingLog[]>([]);
  const [isServiceRunning, setIsServiceRunning] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedIpAddress, setSelectedIpAddress] = useState('');

  useEffect(() => {
    ghostBusterAndSetup();
    loadData();

    const interval = setInterval(() => { loadData(); }, 5000);
    return () => clearInterval(interval);
  }, []);

  const ghostBusterAndSetup = async () => {
    // 1. HAYALET AVCISI: Eski sistemdeki tüm tetikleyicileri ve asılı alarmları yokediyoruz!
    try {
      const triggerIds = await notifee.getTriggerNotificationIds();
      if (triggerIds.length > 0) {
        await notifee.cancelTriggerNotifications(triggerIds);
      }
      await notifee.cancelAllNotifications();
    } catch (e) {
      console.log('Hayalet temizliği yapılamadı', e);
    }

    // 2. Kanal İzinleri
    const settings = await notifee.requestPermission();
    if (settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED) {
      await notifee.createChannel({
        id: 'siren_channel_final',
        name: 'Kritik IP Siren Kanalı V3',
        importance: AndroidImportance.HIGH,
        sound: 'siren',
        vibration: true,
      });

      // GARANTİLİ SESSİZ KANAL
      await notifee.createChannel({
        id: 'silent_bg_v4', // İsim değiştirildi ki Samsung önbelleği tamamen unutsun
        name: 'Sessiz Arka Plan Bilgisi',
        importance: AndroidImportance.LOW, 
        sound: undefined,
        vibration: false,
      });
    }
  };

  const loadData = async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(STORAGE_KEY);
      const logsValue = await AsyncStorage.getItem(LOGS_KEY);
      if (jsonValue != null) setIpList(JSON.parse(jsonValue));
      if (logsValue != null) setAllLogs(JSON.parse(logsValue));
    } catch (e) { }
  };

  const saveData = async (newList: IpItem[], newLogs?: PingLog[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
      setIpList(newList);
      if (newLogs) {
        const cleaned = cleanOldLogs(newLogs);
        await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(cleaned));
        setAllLogs(cleaned);
      }
    } catch (e) { }
  };

  const addIpAddress = () => {
    if (!ipAddress.trim()) return;
    if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ipAddress.trim())) {
      Alert.alert('Uyarı', 'Lütfen geçerli bir IP adresi formatı girin.');
      return;
    }
    const newIp: IpItem = { id: Date.now().toString(), address: ipAddress.trim(), status: 'Beklemede', isPaused: false };
    saveData([...ipList, newIp]);
    setIpAddress('');
  };

  const deleteIpAddress = (id: string, address: string) => {
    Alert.alert('Cihazı Sil', `${address} adresini silmek istediğinize emin misiniz?`, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => saveData(ipList.filter(item => item.id !== id), allLogs.filter(log => log.ipAddress !== address)) }
    ]);
  };

  const togglePauseIp = (id: string) => {
    const updatedList = ipList.map(item => {
      if (item.id === id) {
        const nextState = !item.isPaused;
        return { ...item, isPaused: nextState, status: nextState ? 'Duraklatıldı ⏸️' : 'Beklemede' };
      }
      return item;
    });
    saveData(updatedList);
  };

  const openIpDetails = (address: string) => {
    setSelectedIpAddress(address);
    setSelectedIpLogs(allLogs.filter(log => log.ipAddress === address).reverse());
    setModalVisible(true);
  };

  const manualTestAll = async () => {
    if (ipList.length === 0) return;
    const updatedList = [...ipList];
    let failedIps: string[] = [];
    let newLogsArray = [...allLogs];
    const date = new Date();
    const timestamp = `${date.toLocaleDateString('tr-TR')}, ${date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;

    for (let item of updatedList) {
      if (item.isPaused) continue;
      item.status = '⏳ Test ediliyor...';
      setIpList([...updatedList]);
      
      let logStatus: 'Başarılı 🟢' | 'Başarısız 🔴' = 'Başarılı 🟢';
      let isError = false;
      try {
        const ms = await safePing(item.address, 1500);
        item.status = `🟢 ${ms}ms`;
      } catch (error) {
        item.status = '🔴 Çevrimdışı';
        failedIps.push(item.address);
        logStatus = 'Başarısız 🔴';
        isError = true;
      }
      item.lastChecked = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

      newLogsArray.push({ id: Date.now().toString() + Math.random().toString(), ipAddress: item.address, status: logStatus, timestamp: timestamp, isError: isError });
      
      await delay(1000); // UI işlemcisini rahatlat
    }
    saveData(updatedList, newLogsArray);

    if (failedIps.length > 0) {
      await notifee.displayNotification({
        id: 'siren_alert_critical',
        title: '🚨 ACİL DURUM: SİSTEM ÇEVRİMDIŞI!',
        body: `${failedIps.join(', ')} adreslerine ulaşılamıyor!`,
        android: { channelId: 'siren_channel_final', importance: AndroidImportance.HIGH, category: AndroidCategory.ALARM, sound: 'siren' },
      });
    }
  };

  const toggleBackgroundService = async () => {
    if (!isServiceRunning) {
      if (ipList.filter(i => !i.isPaused).length === 0) {
        Alert.alert('Uyarı', 'Lütfen önce aktif bir cihaz ekleyin.');
        return;
      }

      isServiceGloballyRunning = true; 
      setIsServiceRunning(true);
      
      await notifee.displayNotification({
        id: 'pinger_periodic_notification',
        title: 'Pinger Pro: Ağ İzleme Aktif',
        body: 'Altyapı cihazları arka planda sessizce taranıyor...',
        android: {
          channelId: 'silent_bg_v4', // YENİ SESSİZ KANAL
          asForegroundService: true, 
          importance: AndroidImportance.LOW,
          ongoing: true, 
        },
      });
      manualTestAll();
    } else {
      isServiceGloballyRunning = false; 
      if (globalTimeoutId) clearTimeout(globalTimeoutId);
      if (wakeUpFunction) wakeUpFunction(); 
      setIsServiceRunning(false);
      await notifee.stopForegroundService(); 
    }
  };

  const renderLogItem = ({ item }: { item: PingLog }) => (
    <View style={[styles.logRow, item.isError ? styles.logRowError : styles.logRowSuccess]}>
      <View style={styles.logIconContainer}><Text style={styles.logIconText}>{item.isError ? '🔴' : '🟢'}</Text></View>
      <View style={styles.logTextContainer}>
        <Text style={styles.logDateText}>{item.timestamp}</Text>
        <Text style={[styles.logStatusText, item.isError ? styles.textRed : styles.textGreen]}>Durum: {item.status}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.appHeader}>
        <Text style={styles.headerTitle}>Pinger Pro</Text>
        <Text style={styles.headerSubTitle}>IP Altyapı İzleme Paneli</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Yeni Cihaz IP Ekle:</Text>
        <View style={styles.inputRow}>
          <TextInput style={styles.input} value={ipAddress} onChangeText={setIpAddress} placeholder="Örn: 10.0.0.1" placeholderTextColor="#9CA3AF" keyboardType="numeric" />
          <TouchableOpacity style={styles.addButton} onPress={addIpAddress}><Text style={styles.addButtonText}>Ekle</Text></TouchableOpacity>
        </View>
      </View>
      <View style={styles.buttonRow}>
        <TouchableOpacity style={[styles.controlButton, styles.btnTest]} onPress={manualTestAll}><Text style={styles.btnText}>Anlık Tara</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.controlButton, isServiceRunning ? styles.btnStop : styles.btnStart]} onPress={toggleBackgroundService}>
          <Text style={styles.btnText}>{isServiceRunning ? 'Oto İzlemeyi Kapat' : 'Oto İzlemeyi Aç (5 Dk)'}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.sectionTitle}>İzlenen Cihazlar (Detay için satıra tıkla)</Text>
      <FlatList
        data={ipList}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.ipCard, item.isPaused && styles.ipCardPaused]} onPress={() => openIpDetails(item.address)} activeOpacity={0.8}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.ipAddressText, item.isPaused && styles.textMuted]}>{item.address}</Text>
              <Text style={[styles.ipStatusText, item.isPaused && styles.textMuted]}>Durum: {item.status}</Text>
              {item.lastChecked && <Text style={styles.timeText}>Son: {item.lastChecked}</Text>}
            </View>
            <View style={styles.actionButtons}>
              <TouchableOpacity style={[styles.miniButton, item.isPaused ? styles.btnResumeMini : styles.btnPauseMini]} onPress={() => togglePauseIp(item.id)}>
                <Text style={styles.miniButtonText}>{item.isPaused ? '▶️' : '⏸️'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={() => deleteIpAddress(item.id, item.address)}><Text style={styles.deleteButtonText}>🗑️</Text></TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>Henüz bir cihaz eklenmedi.</Text>}
      />
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeaderView}>
              <Text style={styles.modalTitle}>{selectedIpAddress}</Text>
              <Text style={styles.modalSubTitle}>Son 7 Günlük Kayıtlar</Text>
            </View>
            <FlatList data={selectedIpLogs} keyExtractor={log => log.id} contentContainerStyle={{ paddingHorizontal: 5 }} renderItem={renderLogItem} ListEmptyComponent={<Text style={styles.noLogText}>Kayıt günlüğü boş.</Text>} />
            <TouchableOpacity style={styles.closeModalButton} onPress={() => setModalVisible(false)}><Text style={styles.closeModalButtonText}>Kapat</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB', padding: 15 },
  appHeader: { alignItems: 'center', marginVertical: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  headerTitle: { fontSize: 26, fontWeight: 'bold', color: '#111827', letterSpacing: 1 },
  headerSubTitle: { fontSize: 13, color: '#6B7280', marginTop: 2, fontWeight: '500' },
  card: { backgroundColor: 'white', padding: 15, borderRadius: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, marginBottom: 15 },
  label: { fontSize: 13, color: '#374151', marginBottom: 10, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, fontSize: 15, color: '#111827' },
  addButton: { backgroundColor: '#4F46E5', marginLeft: 10, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10 },
  addButtonText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  controlButton: { flex: 0.48, padding: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  btnTest: { backgroundColor: '#059669' },
  btnStart: { backgroundColor: '#2563EB' },
  btnStop: { backgroundColor: '#DC2626' },
  btnText: { color: 'white', fontWeight: 'bold', textAlign: 'center', fontSize: 13 },
  ipCard: { backgroundColor: 'white', padding: 15, borderRadius: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, elevation: 1, borderLeftWidth: 4, borderLeftColor: '#4F46E5' },
  ipCardPaused: { backgroundColor: '#F3F4F6', borderLeftColor: '#9CA3AF' },
  ipAddressText: { fontSize: 17, fontWeight: 'bold', color: '#111827' },
  ipStatusText: { fontSize: 13, color: '#4B5563', marginTop: 4, fontWeight: '500' },
  timeText: { fontSize: 11, color: '#9CA3AF', marginTop: 3 },
  textMuted: { color: '#9CA3AF' },
  actionButtons: { flexDirection: 'row', alignItems: 'center' },
  miniButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, marginRight: 8 },
  btnPauseMini: { backgroundColor: '#FFFBEB' }, 
  btnResumeMini: { backgroundColor: '#ECFDF5' }, 
  miniButtonText: { fontSize: 13 },
  deleteButton: { backgroundColor: '#FEF2F2', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 }, 
  deleteButtonText: { fontSize: 13 },
  emptyText: { textAlign: 'center', color: '#9CA3AF', marginTop: 40, fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
  modalHeaderView: { alignItems: 'center', marginBottom: 15, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  modalSubTitle: { fontSize: 12, color: '#6B7280', marginTop: 3 },
  noLogText: { textAlign: 'center', color: '#9CA3AF', marginVertical: 40, fontSize: 14 },
  closeModalButton: { backgroundColor: '#111827', marginTop: 15, padding: 14, borderRadius: 12, alignItems: 'center' },
  closeModalButtonText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  logRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, marginBottom: 8 },
  logRowSuccess: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#DCFCE7' },
  logRowError: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FEE2E2' },
  logIconContainer: { marginRight: 10 },
  logIconText: { fontSize: 16 },
  logTextContainer: { flex: 1 },
  logDateText: { fontSize: 11, color: '#6B7280', fontWeight: '500' },
  logStatusText: { fontSize: 13, fontWeight: 'bold', marginTop: 2 },
  textGreen: { color: '#166534' },
  textRed: { color: '#991B1B' }
});

export default App;