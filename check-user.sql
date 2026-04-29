SELECT u.id, u.email, vu.rol, vu.tenant_id
FROM auth.users u
LEFT JOIN volvix_usuarios vu ON vu.user_id = u.id::text
WHERE u.email = 'admin@volvix.test';
