import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Plus, Edit2, Trash2, Save, X, Loader2, Package, ArrowDownCircle, ArrowUpCircle, Download, BarChart3, Upload, FileSpreadsheet } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import * as XLSX from 'xlsx';
import type { HerbInventory, HerbStockLog } from '../types';

type TabType = 'stock' | 'incoming' | 'logs';

export function Inventory() {
  const [inventory, setInventory] = useState<HerbInventory[]>([]);
  const [logs, setLogs] = useState<HerbStockLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('stock');
  const [searchTerm, setSearchTerm] = useState('');

  // 약재 추가/수정
  const [editingItem, setEditingItem] = useState<HerbInventory | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // 입고 등록
  const [incomingHerbId, setIncomingHerbId] = useState<number>(0);
  const [incomingAmount, setIncomingAmount] = useState('');
  const [incomingNote, setIncomingNote] = useState('');

  // 이력 필터
  const [logFilterHerbId, setLogFilterHerbId] = useState<number>(0);

  // 엑셀 업로드
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [excelPreview, setExcelPreview] = useState<Array<{ name: string; current_stock: number; min_stock: number; cost_per_unit: number; supplier: string }>>([]);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);

  useEffect(() => {
    loadInventory();
    loadLogs();
  }, []);

  const loadInventory = async () => {
    try {
      setLoading(true);
      const data = await invoke<HerbInventory[]>('list_herb_inventory');
      setInventory(data);
    } catch (error) {
      console.error('재고 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async (herbId?: number) => {
    try {
      const data = await invoke<HerbStockLog[]>('list_herb_stock_logs', {
        herbInventoryId: herbId || null,
        limit: 200,
      });
      setLogs(data);
    } catch (error) {
      console.error('이력 로드 실패:', error);
    }
  };

  // 요약 통계
  const summary = useMemo(() => {
    const total = inventory.length;
    const low = inventory.filter(i => i.min_stock > 0 && i.current_stock <= i.min_stock && i.current_stock > 0).length;
    const empty = inventory.filter(i => i.current_stock <= 0).length;
    const normal = total - low - empty;
    return { total, normal, low, empty };
  }, [inventory]);

  // 검색 필터
  const filteredInventory = useMemo(() => {
    if (!searchTerm) return inventory;
    const term = searchTerm.toLowerCase();
    return inventory.filter(i =>
      i.name.toLowerCase().includes(term) ||
      i.supplier?.toLowerCase().includes(term)
    );
  }, [inventory, searchTerm]);

  // 약재 저장
  const handleSaveItem = async () => {
    if (!editingItem || !editingItem.name.trim()) return;
    try {
      const now = new Date().toISOString();
      if (editingItem.id) {
        await invoke('update_herb_inventory', { item: { ...editingItem, updated_at: now } });
      } else {
        await invoke('create_herb_inventory', {
          item: { ...editingItem, id: 0, created_at: now, updated_at: now },
        });
      }
      loadInventory();
      setIsFormOpen(false);
      setEditingItem(null);
    } catch (error) {
      console.error('저장 실패:', error);
      alert('저장에 실패했습니다.');
    }
  };

  // 약재 삭제
  const handleDeleteItem = async (id: number) => {
    if (!confirm('이 약재를 삭제하시겠습니까? 입출고 이력도 함께 삭제됩니다.')) return;
    try {
      await invoke('delete_herb_inventory', { id });
      loadInventory();
    } catch (error) {
      console.error('삭제 실패:', error);
    }
  };

  // herbs 테이블에서 일괄 가져오기
  const handleBulkImport = async () => {
    try {
      const count = await invoke<number>('bulk_import_herb_inventory');
      if (count > 0) {
        alert(`${count}개 약재를 가져왔습니다.`);
        loadInventory();
      } else {
        alert('새로 가져올 약재가 없습니다.');
      }
    } catch (error) {
      console.error('일괄 가져오기 실패:', error);
    }
  };

  // 엑셀 샘플 다운로드
  const handleDownloadSample = () => {
    const sampleData = [
      { 약재명: '감초', 재고: 500, 최소재고: 100, 단가: 15000, 공급처: '○○약업사' },
      { 약재명: '백출', 재고: 300, 최소재고: 50, 단가: 20000, 공급처: '○○약업사' },
      { 약재명: '인삼', 재고: 200, 최소재고: 50, 단가: 80000, 공급처: '' },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '약재목록');
    XLSX.writeFile(wb, '약재_일괄등록_샘플.xlsx');
  };

  // 엑셀 파일 파싱
  const handleExcelFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

        // 컬럼 매핑 (유연하게)
        const parsed = rows.map(row => {
          const name = String(row['약재명'] || row['이름'] || row['name'] || row['Name'] || '').trim();
          const stock = Number(row['재고'] || row['현재재고'] || row['current_stock'] || row['수량'] || 0);
          const minStock = Number(row['최소재고'] || row['min_stock'] || 0);
          const cost = Number(row['단가'] || row['cost'] || row['가격'] || 0);
          const supplier = String(row['공급처'] || row['supplier'] || row['업체'] || '').trim();
          return { name, current_stock: stock, min_stock: minStock, cost_per_unit: cost, supplier };
        }).filter(item => item.name.length > 0);

        if (parsed.length === 0) {
          alert('약재 데이터를 찾을 수 없습니다.\n첫 행에 "약재명" 컬럼이 있어야 합니다.');
          return;
        }

        setExcelPreview(parsed);
        setIsExcelModalOpen(true);
      } catch (err) {
        console.error('엑셀 파싱 실패:', err);
        alert('엑셀 파일을 읽을 수 없습니다.');
      }
    };
    reader.readAsArrayBuffer(file);
    // 같은 파일 다시 선택 가능하도록
    e.target.value = '';
  };

  // 엑셀 데이터 일괄 등록
  const handleExcelImport = async () => {
    const now = new Date().toISOString();
    let created = 0;
    for (const item of excelPreview) {
      try {
        await invoke('create_herb_inventory', {
          item: {
            id: 0,
            herb_id: null,
            name: item.name,
            unit: 'g',
            current_stock: item.current_stock,
            min_stock: item.min_stock,
            cost_per_unit: item.cost_per_unit,
            supplier: item.supplier || null,
            memo: null,
            created_at: now,
            updated_at: now,
          },
        });
        created++;
      } catch (err) {
        console.error(`${item.name} 등록 실패:`, err);
      }
    }
    alert(`${created}개 약재를 등록했습니다.`);
    setIsExcelModalOpen(false);
    setExcelPreview([]);
    loadInventory();
  };

  // 입고 등록
  const handleIncoming = async () => {
    if (!incomingHerbId || !incomingAmount) return;
    try {
      const now = new Date().toISOString();
      const herb = inventory.find(i => i.id === incomingHerbId);
      await invoke('add_stock_log', {
        log: {
          id: 0,
          herb_inventory_id: incomingHerbId,
          log_type: 'in',
          amount: parseFloat(incomingAmount),
          prescription_id: null,
          patient_name: null,
          herb_name: herb?.name || '',
          note: incomingNote || '수동 입고',
          created_at: now,
        },
      });
      setIncomingAmount('');
      setIncomingNote('');
      setIncomingHerbId(0);
      loadInventory();
      loadLogs();
    } catch (error) {
      console.error('입고 실패:', error);
      alert('입고 등록에 실패했습니다.');
    }
  };

  // 상태 색상
  const getStatusStyle = (item: HerbInventory) => {
    if (item.current_stock <= 0) return { bg: 'bg-red-50', text: 'text-red-700', badge: 'bg-red-100 text-red-700', label: '소진' };
    if (item.min_stock > 0 && item.current_stock <= item.min_stock) return { bg: 'bg-yellow-50', text: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-700', label: '부족' };
    return { bg: 'bg-green-50', text: 'text-green-700', badge: 'bg-green-100 text-green-700', label: '정상' };
  };

  const logTypeLabel = (type: string) => {
    switch (type) {
      case 'in': return { label: '입고', color: 'text-blue-600', icon: <ArrowDownCircle className="w-4 h-4" /> };
      case 'out': return { label: '출고', color: 'text-red-600', icon: <ArrowUpCircle className="w-4 h-4" /> };
      case 'adjust': return { label: '조정', color: 'text-gray-600', icon: <BarChart3 className="w-4 h-4" /> };
      default: return { label: type, color: 'text-gray-600', icon: null };
    }
  };

  // 새 약재 폼 초기값
  const newItem = (): HerbInventory => ({
    id: 0, name: '', unit: 'g', current_stock: 0, min_stock: 0,
    cost_per_unit: 0, created_at: '', updated_at: '',
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">재고관리</h1>
          <p className="text-sm text-gray-500 mt-1">약재 {summary.total}종</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleBulkImport} className="btn-secondary flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" />
            기존 약재 가져오기
          </button>
          <button
            onClick={handleDownloadSample}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Download className="w-4 h-4" />
            엑셀 샘플
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            엑셀 업로드
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleExcelFile}
            className="hidden"
          />
          <button
            onClick={() => { setEditingItem(newItem()); setIsFormOpen(true); }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            약재 추가
          </button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">전체</p>
          <p className="text-2xl font-bold text-gray-900">{summary.total}</p>
        </div>
        <div className="bg-white rounded-lg border border-green-200 p-3">
          <p className="text-xs text-green-600">정상</p>
          <p className="text-2xl font-bold text-green-700">{summary.normal}</p>
        </div>
        <div className="bg-white rounded-lg border border-yellow-200 p-3">
          <p className="text-xs text-yellow-600">부족</p>
          <p className="text-2xl font-bold text-yellow-700">{summary.low}</p>
        </div>
        <div className="bg-white rounded-lg border border-red-200 p-3">
          <p className="text-xs text-red-600">소진</p>
          <p className="text-2xl font-bold text-red-700">{summary.empty}</p>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {([
          { key: 'stock' as TabType, label: '재고현황' },
          { key: 'incoming' as TabType, label: '입고등록' },
          { key: 'logs' as TabType, label: '입출고이력' },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); if (tab.key === 'logs') loadLogs(logFilterHerbId || undefined); }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 내용 */}
      <div className="flex-1 bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
        {activeTab === 'stock' && (
          <>
            {/* 검색 */}
            <div className="p-3 border-b border-gray-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="약재명, 공급처 검색..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* 테이블 */}
            <div className="flex-1 overflow-auto">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">약재명</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">현재재고</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">최소재고</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">상태</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">단가(원/g)</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">공급처</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredInventory.map(item => {
                    const status = getStatusStyle(item);
                    return (
                      <tr key={item.id} className={`hover:bg-gray-50 ${status.bg}`}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.name}</td>
                        <td className="px-4 py-3 text-sm text-right font-mono">
                          {Math.round(item.current_stock)}{item.unit}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-500 font-mono">
                          {item.min_stock > 0 ? `${Math.round(item.min_stock)}${item.unit}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${status.badge}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-500">
                          {item.cost_per_unit > 0 ? `${item.cost_per_unit.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">{item.supplier || '-'}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => { setEditingItem(item); setIsFormOpen(true); }}
                              className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded"
                              title="수정"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                              title="삭제"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredInventory.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>등록된 약재가 없습니다.</p>
                  <p className="text-sm mt-1">"약재 일괄가져오기"로 기존 약재를 가져오세요.</p>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'incoming' && (
          <div className="p-6">
            <h3 className="font-semibold text-gray-900 mb-4">입고 등록</h3>
            <div className="max-w-lg space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">약재 선택</label>
                <select
                  value={incomingHerbId}
                  onChange={(e) => setIncomingHerbId(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value={0}>약재를 선택하세요</option>
                  {inventory.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} (현재: {Math.round(item.current_stock)}{item.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">입고량 (g)</label>
                <input
                  type="number"
                  value={incomingAmount}
                  onChange={(e) => setIncomingAmount(e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">메모 (공급처, 송장번호 등)</label>
                <input
                  type="text"
                  value={incomingNote}
                  onChange={(e) => setIncomingNote(e.target.value)}
                  placeholder="선택사항"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <button
                onClick={handleIncoming}
                disabled={!incomingHerbId || !incomingAmount}
                className="btn-primary flex items-center gap-2 disabled:opacity-40"
              >
                <ArrowDownCircle className="w-4 h-4" />
                입고 등록
              </button>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <>
            <div className="p-3 border-b border-gray-200">
              <select
                value={logFilterHerbId}
                onChange={(e) => { const id = Number(e.target.value); setLogFilterHerbId(id); loadLogs(id || undefined); }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value={0}>전체 약재</option>
                {inventory.map(item => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">일시</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">구분</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">약재</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">수량</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">환자/메모</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map(log => {
                    const typeInfo = logTypeLabel(log.log_type);
                    const herb = inventory.find(i => i.id === log.herb_inventory_id);
                    return (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {new Date(log.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${typeInfo.color}`}>
                            {typeInfo.icon} {typeInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{log.herb_name || herb?.name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-right font-mono">
                          {log.log_type === 'out' ? '-' : ''}{Math.round(log.amount)}g
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {log.patient_name || log.note || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {logs.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <p>입출고 이력이 없습니다.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 약재 추가/수정 모달 */}
      {isFormOpen && editingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onMouseDown={e => e.target === e.currentTarget && (() => { setIsFormOpen(false); setEditingItem(null); })()}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onMouseDown={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingItem.id ? '약재 수정' : '약재 추가'}
              </h2>
              <button onClick={() => { setIsFormOpen(false); setEditingItem(null); }} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">약재명 *</label>
                <input
                  type="text"
                  value={editingItem.name}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">현재재고 (g)</label>
                  <input
                    type="number"
                    value={editingItem.current_stock}
                    onChange={(e) => setEditingItem({ ...editingItem, current_stock: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">최소재고 (g)</label>
                  <input
                    type="number"
                    value={editingItem.min_stock}
                    onChange={(e) => setEditingItem({ ...editingItem, min_stock: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">단가 (원/g)</label>
                  <input
                    type="number"
                    value={editingItem.cost_per_unit}
                    onChange={(e) => setEditingItem({ ...editingItem, cost_per_unit: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">공급처</label>
                  <input
                    type="text"
                    value={editingItem.supplier || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, supplier: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
                <input
                  type="text"
                  value={editingItem.memo || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, memo: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            <div className="flex gap-3 p-4 border-t border-gray-200">
              <button onClick={() => { setIsFormOpen(false); setEditingItem(null); }} className="flex-1 btn-secondary">
                취소
              </button>
              <button onClick={handleSaveItem} disabled={!editingItem.name.trim()} className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-40">
                <Save className="w-4 h-4" />
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 엑셀 미리보기 모달 */}
      {isExcelModalOpen && excelPreview.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onMouseDown={e => e.target === e.currentTarget && (() => { setIsExcelModalOpen(false); setExcelPreview([]); })()}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onMouseDown={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-green-600" />
                엑셀 데이터 확인 ({excelPreview.length}건)
              </h2>
              <button onClick={() => { setIsExcelModalOpen(false); setExcelPreview([]); }} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">#</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">약재명</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">재고(g)</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">최소재고</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">단가</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">공급처</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {excelPreview.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{item.name}</td>
                      <td className="px-3 py-2 text-right font-mono">{item.current_stock}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-500">{item.min_stock || '-'}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{item.cost_per_unit || '-'}</td>
                      <td className="px-3 py-2 text-gray-500">{item.supplier || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 p-4 border-t border-gray-200">
              <button onClick={() => { setIsExcelModalOpen(false); setExcelPreview([]); }} className="flex-1 btn-secondary">
                취소
              </button>
              <button onClick={handleExcelImport} className="flex-1 btn-primary flex items-center justify-center gap-2">
                <Upload className="w-4 h-4" />
                {excelPreview.length}건 등록
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
