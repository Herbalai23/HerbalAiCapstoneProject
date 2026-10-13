import api from '@/lib/axios';
import { invalidateApiGetCache } from '@/lib/request-cache';
import type { Herb } from '../types';
import type React from 'react';
import { getErrorMessage } from '../admin-feedback';

interface HerbActionsContext {
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSuccessMsg: React.Dispatch<React.SetStateAction<string | null>>;
  setAllHerbs: React.Dispatch<React.SetStateAction<Herb[]>>;
  setHerbsTotal: React.Dispatch<React.SetStateAction<number>>;
  setEditingHerb: React.Dispatch<React.SetStateAction<Herb | null>>;
  setHerbFormData: React.Dispatch<React.SetStateAction<{ localName: string; cebuanoName: string; scientificName: string; category: string; medicinalUses: string; preparationMethod: string; dosage: string; regionFound: string; warnings: string; imageUrl: string; }>>;
  setIsHerbModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  editingHerb: Herb | null;
  herbFormData: { localName: string; cebuanoName: string; scientificName: string; category: string; medicinalUses: string; preparationMethod: string; dosage: string; regionFound: string; warnings: string; imageUrl: string; };
}

export function createHerbActions({
  setError,
  setSuccessMsg,
  setAllHerbs,
  setHerbsTotal,
  setEditingHerb,
  setHerbFormData,
  setIsHerbModalOpen,
  editingHerb,
  herbFormData,
}: HerbActionsContext) {
  const handleDeleteHerb = async (id: string) => {
    if (!confirm('Are you sure you want to delete this herb from the library? This cannot be undone.')) return;
    try {
      setError(null);
      setSuccessMsg(null);
      const res = await api.delete(`/herbs/${id}`);
      if (res.data?.status === 'success') {
        invalidateApiGetCache('/herbs');
        setSuccessMsg('Herb deleted successfully.');
        setAllHerbs((prev) => prev.filter((h) => h.id !== id));
        setHerbsTotal((total) => Math.max(0, total - 1));
      }
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Failed to delete herb.'));
    }
  };

  const openEditHerbModal = (herb: Herb) => {
    setEditingHerb(herb);
    setHerbFormData({
      localName: herb.localName,
      cebuanoName: herb.cebuanoName || '',
      scientificName: herb.scientificName,
      category: herb.category,
      medicinalUses: herb.medicinalUses,
      preparationMethod: herb.preparationMethod || '',
      dosage: herb.dosage || '',
      regionFound: herb.regionFound || '',
      warnings: herb.warnings || '',
      imageUrl: herb.imageUrl || '',
    });
    setIsHerbModalOpen(true);
  };

  const closeEditHerbModal = () => {
    setIsHerbModalOpen(false);
    setEditingHerb(null);
  };

  const handleEditHerbSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingHerb) return;
    try {
      setError(null);
      setSuccessMsg(null);
      const res = await api.put(`/herbs/${editingHerb.id}`, herbFormData);
      if (res.data?.status === 'success') {
        invalidateApiGetCache('/herbs');
        setSuccessMsg('Herb updated successfully.');
        setAllHerbs((prev) => prev.map(h => h.id === editingHerb.id ? { ...h, ...herbFormData } : h));
        closeEditHerbModal();
      }
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Failed to update herb.'));
    }
  };

  return { handleDeleteHerb, openEditHerbModal, closeEditHerbModal, handleEditHerbSubmit };
}
