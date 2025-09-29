# Backend Project

This is a NestJS backend application.

## Installation

```bash
npm install
```

## Environment Variables

Create a `.env` file in the `backend` directory with the following variables:

```
DATABASE_HOST=your_postgres_host
DATABASE_PORT=5432
DATABASE_USER=your_postgres_user
DATABASE_PASSWORD=your_postgres_password
DATABASE_NAME=your_postgres_database
API_PORT=3000
```

## Running the app

```bash
# development
npm run start:dev

# watch mode
npm run start:dev

# production mode
npm run start:prod
```

## Test

```bash
# unit tests
npm run test

# e2e tests
npm run test:e2e

# test coverage
npm run test:cov
```

## Database

This project uses PostgreSQL as the database with TypeORM. Make sure your PostgreSQL server is running and accessible with the credentials provided in the `.env` file.

## Further steps

- Define your TypeORM entities in `src/**/*.entity{.ts,.js}`.
- Update your services and controllers to use TypeORM repositories."# crm-tibs-api" 
