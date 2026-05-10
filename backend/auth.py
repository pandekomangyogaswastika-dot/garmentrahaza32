import jwt
import bcrypt
import uuid
import os
import string
import random
from datetime import datetime, timezone, timedelta
from fastapi import Request, HTTPException
from database import get_db

# H3 fix: No hardcoded fallback — raise KeyError fast if env is missing
JWT_SECRET = os.environ.get('JWT_SECRET')
if not JWT_SECRET:
    raise RuntimeError(
        "JWT_SECRET env var is required. Set it in .env before starting the server."
    )

def generate_password(length=10):
    chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!'
    return ''.join(random.choice(chars) for _ in range(length))

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(10)).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_data: dict) -> str:
    payload = {
        'id': user_data['id'],
        'email': user_data['email'],
        'role': user_data['role'],
        'name': user_data['name'],
        'vendor_id': user_data.get('vendor_id'),
        'buyer_id': user_data.get('buyer_id'),
        'customer_name': user_data.get('customer_name', user_data.get('buyer_company', '')),
        'exp': datetime.now(timezone.utc) + timedelta(hours=24)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')

def verify_token(request: Request):
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None
    try:
        token = auth_header.split(' ')[1]
        return jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
    except Exception:
        return None

def verify_token_str(token: str):
    """Verify a raw JWT string (no Request object). Used for query-param auth."""
    if not token:
        return None
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
    except Exception:
        return None

async def require_auth(request: Request):
    user = verify_token(request)
    if not user:
        raise HTTPException(status_code=401, detail='Unauthorized')
    # Pre-load permissions for custom roles
    role = user.get('role', '')
    if role == 'superadmin' or role == 'admin':
        user['_permissions'] = ['*']
    elif role == 'vendor':
        user['_permissions'] = ['dashboard.view', 'shipment.view', 'jobs.view', 'jobs.create', 'progress.view', 'progress.create']
    elif role == 'buyer':
        user['_permissions'] = ['dashboard.view', 'po.view', 'shipment.view']
    else:
        # Custom role: load from DB
        db = get_db()
        custom_role = await db.roles.find_one({'name': role})
        if custom_role:
            role_perms = await db.role_permissions.find({'role_id': custom_role['id']}, {'_id': 0}).to_list(None)
            user['_permissions'] = [rp.get('permission_key') for rp in role_perms]
        else:
            user['_permissions'] = []
    return user

def check_role(user: dict, allowed_roles: list, perm_key: str = None) -> bool:
    if user.get('role') == 'superadmin':
        return True
    if user.get('role') in allowed_roles:
        return True
    # Check custom role permissions loaded by require_auth
    perms = user.get('_permissions', [])
    if '*' in perms:
        return True
    if perm_key and perm_key in perms:
        return True
    # If no specific perm_key provided, check if user has any admin-level permissions
    if not perm_key and perms:
        return True
    return False

async def log_activity(user_id, user_name, action, module, details=''):
    db = get_db()
    await db.activity_logs.insert_one({
        'id': str(uuid.uuid4()),
        'user_id': user_id,
        'user_name': user_name,
        'action': action,
        'module': module,
        'details': details,
        'timestamp': datetime.now(timezone.utc)
    })

async def seed_initial_data():
    db = get_db()

    # Ensure superadmin
    admin = await db.users.find_one({'email': 'admin@garment.com'})
    if not admin:
        hashed = hash_password('Admin@123')
        await db.users.insert_one({
            'id': str(uuid.uuid4()),
            'name': 'Super Admin',
            'email': 'admin@garment.com',
            'password': hashed,
            'role': 'superadmin',
            'status': 'active',
            'created_at': datetime.now(timezone.utc),
            'updated_at': datetime.now(timezone.utc)
        })
        print('Superadmin seeded: admin@garment.com / Admin@123')

    # Seed default custom roles for PT Rahaza RBAC (Fase 1 kerangka)
    await _seed_default_roles(db)

    # Seed company profile placeholder (PT Rahaza)
    existing_co = await db.company_settings.find_one({})
    if not existing_co:
        await db.company_settings.insert_one({
            'id': str(uuid.uuid4()),
            'company_name': 'PT RAHAZA GLOBAL INDONESIA',
            'company_address': 'Knit Garment Manufacturing',
            'company_tagline': 'Production Work Sheet',
            'npwp': '',
            'phone': '',
            'email': '',
            'created_at': datetime.now(timezone.utc),
            'updated_at': datetime.now(timezone.utc),
        })
        print('  · Company settings seeded')


async def _seed_default_roles(db):
    DEFAULT_ROLES = [
        {'name': 'supervisor', 'description': 'Supervisor Lini Produksi'},
        {'name': 'accounting', 'description': 'Tim Keuangan'},
        {'name': 'hr', 'description': 'Tim SDM'},
        {'name': 'operator', 'description': 'Operator Lantai'},
        {'name': 'ppic', 'description': 'PPIC/Planner'},
        {'name': 'owner', 'description': 'Owner/Pemilik'},
    ]
    for role_data in DEFAULT_ROLES:
        existing = await db.roles.find_one({'name': role_data['name']})
        if not existing:
            await db.roles.insert_one({
                'id': str(uuid.uuid4()),
                **role_data,
                'active': True,
                'created_at': datetime.now(timezone.utc),
            })

def serialize_doc(doc):
    """Recursively convert MongoDB documents to JSON-serializable format."""
    if isinstance(doc, list):
        return [serialize_doc(d) for d in doc]
    if isinstance(doc, dict):
        result = {}
        for k, v in doc.items():
            if k == '_id':
                continue
            result[k] = serialize_doc(v)
        return result
    if isinstance(doc, datetime):
        return doc.isoformat()
    return doc
