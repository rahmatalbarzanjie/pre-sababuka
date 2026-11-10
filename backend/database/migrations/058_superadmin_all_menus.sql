-- Superadmin harus dapat membuka seluruh menu agar semua alur bisa diuji.
-- Menambahkan semua menu ke role superadmin dan memberi dua izin lihat yang sebelumnya
-- tidak dimiliki (asisten AI dan pembinaan statistik) karena menu tersebut disaring oleh izin.
INSERT INTO sababuka.role_menu_items (role_id, menu_item_id, is_visible)
SELECT r.id, m.id, true
FROM sababuka.roles r
CROSS JOIN sababuka.menu_items m
WHERE r.code = 'superadmin'
ON CONFLICT (role_id, menu_item_id) DO UPDATE SET is_visible = true;

INSERT INTO sababuka.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM sababuka.roles r
JOIN sababuka.permissions p ON p.code IN ('assistant.use', 'statistical_guidance.view')
WHERE r.code = 'superadmin'
ON CONFLICT (role_id, permission_id) DO NOTHING;
