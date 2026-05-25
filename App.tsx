import React, { useState, useEffect } from 'react';
import { SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View, FlatList, Alert, Modal, ScrollView } from 'react-native';
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
}

const cleanOldLogs = (logs: PingLog[]): PingLog[] => {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return logs.filter(log => parseInt(log.id) > thirtyDaysAgo);
};

// --- S22 ULTRA'YI KİLİTLİ EKRANDA ASLA UYUTMAYACAK O GERÇEK ÖN PLAN MOTORU ---
notifee.registerForegroundService((notification) => {
  return new Promise(async (resolve) => {
    // Servis açık olduğu sürece bu sonsuz döngü Android Doze modunu deler geçer
    while (true) {
      try {
        const jsonValue = await AsyncStorage.getItem(STORAGE_KEY);
        const logsValue = await AsyncStorage.getItem(LOGS_KEY);
        
        if (jsonValue) {
          const currentList: IpItem[] = JSON.parse(jsonValue);
          let existingLogs: PingLog[] = logsValue ? JSON.parse(logsValue) : [];
          let failedIps: string[] = [];
          const nowStr = `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;

          for (let item of currentList) {
            if (item.isPaused) continue; // Duraklatıldıysa es geç

            let logStatus: 'Başarılı 🟢' | 'Başarısız 🔴' = 'Başarılı 🟢';
            try {
              const ms = await Ping.start(item.address, { timeout: 2000 });
              item.status = `Çevrimiçi 🟢 (${ms}ms)`;
            } catch (error) {
              item.status = 'Çevrimdışı 🔴';
              failedIps.push(item.address);
              logStatus = 'Başarısız 🔴';
            }
            item.lastChecked = new Date().toLocaleTimeString();

            existingLogs.push({
              id: Date.now().toString() + Math.random().toString(),
              ipAddress: item.address,
              status: logStatus,
              timestamp: nowStr
            });
          }

          existingLogs = cleanOldLogs(existingLogs);
          await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(existingLogs));
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(currentList));

          // EĞER ÇÖKEN CİHAZ VARSA SIREN ÇAL!
          if (failedIps.length > 0) {
            await notifee.displayNotification({
              id: 'siren_alert',
              title: '🚨 ACİL DURUM: SİSTEM ÇEVRİMDIŞI!',
              body: `${failedIps.join(', ')} adreslerine ulaşılamıyor!`,
              android: {
                channelId: 'siren_channel_final',
                importance: AndroidImportance.HIGH,
                priority: 'high',
                category: AndroidCategory.ALARM,
                visibility: AndroidVisibility.PUBLIC,
                sound: 'siren',
                vibrationPattern: [300, 500, 300, 500],
                pressAction: { id: 'default' },
              },
            });
          }
        }
      } catch (e) {
        console.log('Servis içi hata:', e);
      }

      // --- TEST İÇİN BEKLEME SÜRESİ: 1 DAKİKA (60.000 ms) ---
      // Gerçek kullanımda burayı dilersen 5 dakikaya (300000) çekebilirsin.
      await new Promise((r) => setTimeout(r, 60000));
    }
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
    checkAndRequestPermissions();
    loadData();

    const interval = setInterval(() => {
      loadData();
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const checkAndRequestPermissions = async () => {
    const settings = await notifee.requestPermission();
    if (settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED) {
      await notifee.createChannel({
        id: 'siren_channel_final',
        name: 'Kritik IP Siren Kanalı V3',
        importance: AndroidImportance.HIGH,
        sound: 'siren',
        vibration: true,
      });
    }
  };

  const loadData = async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(STORAGE_KEY);
      const logsValue = await AsyncStorage.getItem(LOGS_KEY);
      if (jsonValue != null) setIpList(JSON.parse(jsonValue));
      if (logsValue != null) setAllLogs(JSON.parse(logsValue));
    } catch (e) {
      console.log('Veri Yükleme Hatası');
    }
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
    } catch (e) {
      console.log('Veri Kayıt Hatası');
    }
  };

  const addIpAddress = () => {
    if (!ipAddress.trim()) return;
    const newIp: IpItem = { id: Date.now().toString(), address: ipAddress.trim(), status: 'Beklemede', isPaused: false };
    saveData([...ipList, newIp]);
    setIpAddress('');
  };

  const deleteIpAddress = (id: string, address: string) => {
    saveData(ipList.filter(item => item.id !== id), allLogs.filter(log => log.ipAddress !== address));
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
    const updatedList = [...ipList];
    let failedIps: string[] = [];
    let newLogsArray = [...allLogs];
    const nowStr = `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;

    for (let item of updatedList) {
      if (item.isPaused) continue;
      item.status = 'Test ediliyor... ⏳';
      setIpList([...updatedList]);
      
      let logStatus: 'Başarılı 🟢' | 'Başarısız 🔴' = 'Başarılı 🟢';
      try {
        const ms = await Ping.start(item.address, { timeout: 1500 });
        item.status = `Çevrimiçi 🟢 (${ms}ms)`;
      } catch (error) {
        item.status = 'Çevrimdışı 🔴';
        failedIps.push(item.address);
        logStatus = 'Başarısız 🔴';
      }
      item.lastChecked = new Date().toLocaleTimeString();

      newLogsArray.push({
        id: Date.now().toString() + Math.random().toString(),
        ipAddress: item.address,
        status: logStatus,
        timestamp: nowStr
      });
    }
    saveData(updatedList, newLogsArray);

    if (failedIps.length > 0) {
      // Manuel testte de hemen siren çalsın
      await notifee.displayNotification({
        id: 'siren_alert',
        title: '🚨 ACİL DURUM: SİSTEM ÇEVRİMDIŞI!',
        body: `${failedIps.join(', ')} adreslerine ulaşılamıyor!`,
        android: {
          channelId: 'siren_channel_final',
          importance: AndroidImportance.HIGH,
          category: AndroidCategory.ALARM,
          sound: 'siren',
        },
      });
    }
  };

  // --- NATIVE ARKA PLAN SERVİSİNİ TETİKLEME / DURDURMA ---
  const toggleBackgroundService = async () => {
    if (!isServiceRunning) {
      // Sabit ve yok edilemez Ön Plan Bildirimini başlatıyoruz
      await notifee.displayNotification({
        id: 'pinger_periodic_notification',
        title: 'Pinger Pro: Ağ İzleme Aktif',
        body: 'Altyapı cihazları arka plande kesintisiz taranıyor...',
        android: {
          channelId: 'siren_channel_final',
          asForegroundService: true, // <-- ANDROID DOZE MODUNU YOK EDEN SİHİRLİ PARAMETRE!
          importance: AndroidImportance.LOW,
          ongoing: true, // Kullanıcı bildirimi sağa kaydırıp kapatamasın
        },
      });
      setIsServiceRunning(true);
      manualTestAll();
    } else {
      // Ön plan servisini tamamen kapat
      await notifee.stopForegroundService();
      setIsServiceRunning(false);
      Alert.alert('İzleme Durduruldu', 'Arka plan takibi kapatıldı.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Pinger Pro: IT İzleme Merkezi</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Yeni Altyapı / Cihaz IP Ekle:</Text>
        <View style={styles.inputRow}>
          <TextInput style={styles.input} value={ipAddress} onChangeText={setIpAddress} placeholder="Örn: 10.0.0.1" placeholderTextColor="#9CA3AF" />
          <TouchableOpacity style={styles.addButton} onPress={addIpAddress}><Text style={styles.addButtonText}>Ekle</Text></TouchableOpacity>
        </View>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={[styles.controlButton, styles.btnTest]} onPress={manualTestAll}><Text style={styles.btnText}>Hepsini Tara</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.controlButton, isServiceRunning ? styles.btnStop : styles.btnStart]} onPress={toggleBackgroundService}>
          <Text style={styles.btnText}>{isServiceRunning ? 'Oto İzlemeyi Kapat' : 'Oto İzlemeyi Aç (1 Dk)'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>İzlenen Cihazlar (Detay için satıra tıkla)</Text>
      
      <FlatList
        data={ipList}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.ipCard, item.isPaused && styles.ipCardPaused]} onPress={() => openIpDetails(item.address)} activeOpacity={0.7}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.ipAddressText, item.isPaused && styles.textMuted]}>{item.address}</Text>
              <Text style={styles.ipStatusText}>Durum: {item.status}</Text>
              {item.lastChecked && <Text style={styles.timeText}>Son Kontrol: {item.lastChecked}</Text>}
            </View>
            <View style={styles.actionButtons}>
              <TouchableOpacity style={[styles.miniButton, item.isPaused ? styles.btnResumeMini : styles.btnPauseMini]} onPress={() => togglePauseIp(item.id)}>
                <Text style={styles.miniButtonText}>{item.isPaused ? 'Başlat' : 'Duraklat'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={() => deleteIpAddress(item.id, item.address)}><Text style={styles.deleteButtonText}>Sil</Text></TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>Takip listesi boş.</Text>}
      />

      {/* 30 Günlük Log Tablosu Modalı */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalHeader}>{selectedIpAddress} - Son 30 Günlük Günlük Raporu</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 2 }]}>Tarih / Saat</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Durum</Text>
            </View>
            <ScrollView style={{ maxHeight: 350 }}>
              {selectedIpLogs.length > 0 ? (
                selectedIpLogs.map((log) => (
                  <View key={log.id} style={styles.tableRow}>
                    <Text style={[styles.tableRowText, { flex: 2 }]}>{log.timestamp}</Text>
                    <Text style={[styles.tableRowText, { flex: 1, textAlign: 'right', fontWeight: 'bold' }]}>{log.status}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.noLogText}>Henüz taranmış bir kayıt günlüğü yok.</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.closeModalButton} onPress={() => setModalVisible(false)}><Text style={styles.closeModalButtonText}>Kapat</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6', padding: 20 },
  header: { fontSize: 20, fontWeight: 'bold', color: '#1F2937', textAlign: 'center', marginVertical: 10 },
  card: { backgroundColor: 'white', padding: 15, borderRadius: 12, elevation: 3, marginBottom: 15 },
  label: { fontSize: 14, color: '#4B5563', marginBottom: 8, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 10, fontSize: 16, color: '#111827' },
  addButton: { backgroundColor: '#4F46E5', marginLeft: 10, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8 },
  addButtonText: { color: 'white', fontWeight: 'bold' },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  controlButton: { flex: 0.48, padding: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  btnTest: { backgroundColor: '#10B981' },
  btnStart: { backgroundColor: '#3B82F6' },
  btnStop: { backgroundColor: '#EF4444' },
  btnText: { color: 'white', fontWeight: 'bold', textAlign: 'center', fontSize: 13 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#374151', marginBottom: 10 },
  ipCard: { backgroundColor: 'white', padding: 14, borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, elevation: 1 },
  ipCardPaused: { backgroundColor: '#E5E7EB' },
  ipAddressText: { fontSize: 17, fontWeight: 'bold', color: '#111827' },
  textMuted: { color: '#9CA3AF', textDecorationLine: 'line-through' },
  ipStatusText: { fontSize: 13, color: '#4B5563', marginTop: 3 },
  timeText: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  actionButtons: { flexDirection: 'row', alignItems: 'center' },
  miniButton: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 6, marginRight: 8 },
  btnPauseMini: { backgroundColor: '#F59E0B' },
  btnResumeMini: { backgroundColor: '#10B981' },
  miniButtonText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  deleteButton: { backgroundColor: '#FEE2E2', paddingVertical: 7, paddingHorizontal: 12, borderRadius: 6 },
  deleteButtonText: { color: '#EF4444', fontWeight: 'bold', fontSize: 12 },
  emptyText: { textAlign: 'center', color: '#9CA3AF', marginTop: 30, fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 16, padding: 20, elevation: 10 },
  modalHeader: { fontSize: 15, fontWeight: 'bold', color: '#111827', marginBottom: 15, textAlign: 'center' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#F3F4F6', padding: 10, borderRadius: 6, marginBottom: 5 },
  tableHeaderText: { fontWeight: 'bold', color: '#4B5563', fontSize: 13 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', padding: 10 },
  tableRowText: { color: '#374151', fontSize: 13 },
  noLogText: { textAlign: 'center', color: '#9CA3AF', marginVertical: 30 },
  closeModalButton: { backgroundColor: '#111827', marginTop: 20, padding: 12, borderRadius: 8, alignItems: 'center' },
  closeModalButtonText: { color: 'white', fontWeight: 'bold' }
});

export default App;