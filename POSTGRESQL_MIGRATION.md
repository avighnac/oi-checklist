# PostgreSQL Migration Guide

The oi-checklist application has been successfully migrated to support PostgreSQL while maintaining backward compatibility with SQLite.

## Database Configuration

The application automatically detects which database to use based on environment variables:

### Using PostgreSQL (Recommended for Production)

Set the `DATABASE_URL` environment variable:

```bash
export DATABASE_URL="postgresql://username:password@host:port/database_name"
```

#### Examples:

**Local PostgreSQL with password:**
```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/oi_checklist"
```

**Local PostgreSQL without password (Unix socket):**
```bash
export DATABASE_URL="postgresql:///oi_checklist?host=/var/run/postgresql"
```

**Heroku Postgres:**
```bash
export DATABASE_URL="postgres://user:password@host:port/database"
```

**Railway, Supabase, or other cloud providers:**
```bash
export DATABASE_URL="postgresql://user:password@host:port/database?sslmode=require"
```

### Using SQLite (Development/Local)

Set the `DATABASE_PATH` environment variable:

```bash
export DATABASE_PATH="/path/to/database.db"
```

If neither `DATABASE_URL` nor `DATABASE_PATH` is set, the application defaults to SQLite with `database.db` in the current directory.

## Database Initialization

### For PostgreSQL:

1. Create your PostgreSQL database:
```bash
createdb oi_checklist
```

2. Set the DATABASE_URL environment variable

3. Initialize the schema:
```bash
export DATABASE_URL="postgresql://username@localhost/oi_checklist"
python3 backend/database/init/init_db.py
```

4. Populate with contest data:
```bash
python3 backend/database/init/populate_problems.py
python3 backend/database/init/populate_contests.py
```

### For SQLite (unchanged):

```bash
export DATABASE_PATH="database.db"
python3 backend/database/init/init_db.py
python3 backend/database/init/populate_problems.py
python3 backend/database/init/populate_contests.py
```

## Environment Variable Priority

1. `DATABASE_URL` - PostgreSQL connection (highest priority)
2. `DATABASE_PATH` - SQLite file path (fallback)
3. Default: `database.db` (SQLite in current directory)

## Updated .env File Example

For development with PostgreSQL:
```env
PORT=5001
FLASK_ENV=local
DATABASE_URL=postgresql://username@localhost/oi_checklist_dev
BACKEND_DIR=/absolute/path/to/backend/
FRONTEND_URL=http://localhost:5501
BACKEND_URL=http://localhost:5001
# ... other OAuth settings
```

For development with SQLite (existing setup):
```env
PORT=5001
FLASK_ENV=local
DATABASE_PATH=database.db
BACKEND_DIR=/absolute/path/to/backend/
FRONTEND_URL=http://localhost:5501
BACKEND_URL=http://localhost:5001
# ... other OAuth settings
```

## Migration from SQLite to PostgreSQL

If you have an existing SQLite database and want to migrate to PostgreSQL:

1. Set up your PostgreSQL database and initialize the schema (as above)
2. Export your SQLite data and import to PostgreSQL using tools like:
   - `pgloader` (recommended)
   - Custom migration scripts
   - Manual export/import

Example with pgloader:
```bash
# Install pgloader
apt-get install pgloader  # Ubuntu/Debian
brew install pgloader     # macOS

# Migrate
pgloader database.db postgresql://user@localhost/oi_checklist
```

## Dependencies

The application now includes `psycopg2-binary` for PostgreSQL support. All dependencies are listed in `backend/requirements.txt`.

## Compatibility

- ✅ All existing SQLite functionality preserved
- ✅ ON CONFLICT (UPSERT) syntax works with both databases
- ✅ Foreign key constraints supported
- ✅ All authentication methods work with both databases
- ✅ Virtual contests and scoring work with both databases

## Testing

Run the comprehensive test to verify both database backends:

```bash
python3 /tmp/test_database_migration.py
```

This test validates:
- Database connections
- Schema compatibility 
- CRUD operations
- Complex queries
- UPSERT functionality

Both SQLite and PostgreSQL should pass all tests.