# PostgreSQL Setup Guide

The oi-checklist application supports both PostgreSQL and SQLite databases, with automatic detection based on environment variables.

## Database Configuration

The application automatically detects which database to use:

### PostgreSQL Setup (Recommended for Production)

Configure PostgreSQL by setting the `DATABASE_URL` environment variable:

```bash
export DATABASE_URL="postgresql://username:password@host:port/database_name"
```

#### Connection Examples:

**Local PostgreSQL with authentication:**
```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/oi_checklist"
```

**Local PostgreSQL with peer authentication (Unix socket):**
```bash
export DATABASE_URL="postgresql:///oi_checklist?host=/var/run/postgresql"
```

**Cloud PostgreSQL (Heroku, Railway, Supabase, etc.):**
```bash
export DATABASE_URL="postgresql://user:password@host:port/database?sslmode=require"
```

### SQLite Setup (Good for Development)

Configure SQLite by setting the `DATABASE_PATH` environment variable:

```bash
export DATABASE_PATH="/path/to/database.db"
```

If no environment variables are set, the application defaults to SQLite with `database.db` in the current directory.

## PostgreSQL Installation

### Local Development

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo -u postgres createuser --interactive
sudo -u postgres createdb oi_checklist
```

**macOS:**
```bash
brew install postgresql
brew services start postgresql
createdb oi_checklist
```

**Windows:**
Download and install from [postgresql.org](https://www.postgresql.org/download/windows/), then use pgAdmin or psql to create the database.

### Cloud Hosting

Popular PostgreSQL hosting options:
- **Heroku Postgres**: Automatic with Heroku deployment
- **Railway**: Easy PostgreSQL addon
- **Supabase**: PostgreSQL with additional features
- **AWS RDS**: Enterprise-grade PostgreSQL
- **Google Cloud SQL**: Managed PostgreSQL service

## Database Initialization

### PostgreSQL Setup:

1. **Create database** (if not already created):
```bash
createdb oi_checklist
```

2. **Set environment variable**:
```bash
export DATABASE_URL="postgresql://username@localhost/oi_checklist"
```

3. **Initialize schema**:
```bash
python3 backend/database/init/init_db.py
```

4. **Populate with data**:
```bash
python3 backend/database/init/populate_problems.py
python3 backend/database/init/populate_contests.py
```

### SQLite Setup:

```bash
export DATABASE_PATH="database.db"
python3 backend/database/init/init_db.py
python3 backend/database/init/populate_problems.py
python3 backend/database/init/populate_contests.py
```

## Environment Configuration

### Production (.env file):
```env
PORT=5001
FLASK_ENV=production
DATABASE_URL=postgresql://user:password@host:port/oi_checklist
BACKEND_DIR=/app/backend/
FRONTEND_URL=https://yourdomain.com
BACKEND_URL=https://api.yourdomain.com
# ... OAuth settings
```

### Development (.env file):
```env
PORT=5001
FLASK_ENV=local
DATABASE_URL=postgresql://username@localhost/oi_checklist_dev
BACKEND_DIR=/absolute/path/to/backend/
FRONTEND_URL=http://localhost:5501
BACKEND_URL=http://localhost:5001
# ... OAuth settings
```

### SQLite Development (.env file):
```env
PORT=5001
FLASK_ENV=local
DATABASE_PATH=database.db
BACKEND_DIR=/absolute/path/to/backend/
FRONTEND_URL=http://localhost:5501
BACKEND_URL=http://localhost:5001
# ... OAuth settings
```

## Data Migration

### From SQLite to PostgreSQL

If you have existing SQLite data to migrate:

1. **Set up PostgreSQL** (follow steps above)
2. **Use the migration script**:
```bash
python3 backend/database/migrate_sqlite_to_postgres.py --sqlite database.db --postgres "postgresql://user@localhost/oi_checklist"
```

### Using External Tools

**pgloader** (alternative method):
```bash
# Install pgloader
apt-get install pgloader  # Ubuntu/Debian
brew install pgloader     # macOS

# Migrate data
pgloader database.db postgresql://user@localhost/oi_checklist
```

## Dependencies

The application includes `psycopg2-binary` for PostgreSQL support. Install dependencies:

```bash
pip install -r backend/requirements.txt
```

## Database Features

- ✅ **Cross-database compatibility**: Same application code works with both databases
- ✅ **UPSERT operations**: `ON CONFLICT ... DO UPDATE` syntax supported
- ✅ **Foreign key constraints**: Referential integrity maintained
- ✅ **Authentication**: All OAuth methods work with both databases  
- ✅ **Virtual contests**: Contest functionality fully compatible
- ✅ **Transaction safety**: ACID compliance on both platforms

## Performance Considerations

**PostgreSQL advantages:**
- Better concurrent access
- Advanced indexing options
- Full-text search capabilities
- Better performance with large datasets
- Production-ready scaling

**SQLite advantages:**
- Zero configuration
- Single file storage
- Excellent for development
- Lower resource usage
- Simpler backup/restore

## Troubleshooting

### PostgreSQL Connection Issues

**"role does not exist":**
```bash
sudo -u postgres createuser $(whoami)
sudo -u postgres createdb oi_checklist -O $(whoami)
```

**"database does not exist":**
```bash
createdb oi_checklist
```

**Connection refused:**
```bash
sudo systemctl start postgresql  # Linux
brew services start postgresql   # macOS
```

### Environment Variable Issues

Check which database is being used:
```python
import os
print("DATABASE_URL:", os.getenv("DATABASE_URL"))
print("DATABASE_PATH:", os.getenv("DATABASE_PATH"))
```

### Schema Issues

If you get table/column errors, reinitialize:
```bash
# Backup your data first if important!
python3 backend/database/init/init_db.py
```

## Testing

Verify your database setup:

```bash
python3 -c "
from backend.database.db import get_db
conn = get_db()
print('Database connection successful!')
cursor = conn.cursor()
cursor.execute('SELECT name FROM contests LIMIT 1;')
print('Sample data:', cursor.fetchone())
conn.close()
"
```

Both SQLite and PostgreSQL should work with the same application code.