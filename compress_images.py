#!/usr/bin/env python3
"""
Script pour compresser les images PNG en réduisant la qualité et la taille.
Utilise PIL (Pillow) pour redimensionner et réduire la profondeur de couleur.
"""
import os
from PIL import Image
import sys

input_dir = "assets/imgV2"
output_dir = "assets/imgV2_compressed"

# Créer le répertoire de sortie s'il n'existe pas
os.makedirs(output_dir, exist_ok=True)

total_size_before = 0
total_size_after = 0
compressed_count = 0

for filename in os.listdir(input_dir):
    if not filename.lower().endswith(('.png', '.jpg', '.jpeg')):
        continue
    
    input_path = os.path.join(input_dir, filename)
    output_path = os.path.join(output_dir, filename)
    
    try:
        # Ouvrir l'image
        img = Image.open(input_path)
        
        # Récupérer la taille avant
        size_before = os.path.getsize(input_path)
        total_size_before += size_before
        
        # Redimensionner si trop grande (max 1200px de large)
        if img.width > 1200:
            ratio = 1200 / img.width
            new_height = int(img.height * ratio)
            img = img.resize((1200, new_height), Image.Resampling.LANCZOS)
        
        # Convertir en RGB si nécessaire (pour PNG avec transparence)
        if img.mode in ('RGBA', 'LA', 'P'):
            # Garder la transparence mais optimiser la palette
            img = img.convert('P', palette=Image.Palette.ADAPTIVE, colors=256)
        
        # Sauvegarder en PNG compressé
        img.save(output_path, 'PNG', optimize=True)
        
        size_after = os.path.getsize(output_path)
        total_size_after += size_after
        
        compression_ratio = (1 - size_after / size_before) * 100
        print(f"✓ {filename}: {size_before/1024:.1f}KB → {size_after/1024:.1f}KB ({compression_ratio:.1f}% compression)")
        
        compressed_count += 1
    except Exception as e:
        print(f"✗ Erreur avec {filename}: {e}")

print(f"\n{'='*60}")
print(f"Total: {compressed_count} images compressées")
print(f"Taille avant: {total_size_before/1024/1024:.2f}MB")
print(f"Taille après: {total_size_after/1024/1024:.2f}MB")
print(f"Compression totale: {(1 - total_size_after/total_size_before)*100:.1f}%")
print(f"Économie: {(total_size_before - total_size_after)/1024/1024:.2f}MB")
print(f"\nImages compressées dans: {output_dir}/")
