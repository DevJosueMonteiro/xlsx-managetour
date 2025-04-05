<<<<<<< HEAD
# Excel File Processor

A full-stack application for processing Excel files and sending data to an external API.

## Features

- User authentication with Supabase
- Excel file upload and processing
- Automatic data extraction from TRANSFER IN and TRANSFER OUT sheets
- JSON generation and API submission
- Logging of API responses in Supabase

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Supabase account and project
- Access to the external API

## Setup

1. Clone the repository
2. Install backend dependencies:
   ```bash
   npm install
   ```

3. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```

4. Configure environment variables:
   - Copy `.env.example` to `.env` in the root directory
   - Copy `frontend/.env.example` to `frontend/.env.local`
   - Update the variables with your Supabase and API credentials

5. Set up Supabase:
   - Create a new project in Supabase
   - Enable Email authentication
   - Create a new table called `api_logs` with the following columns:
     - id (uuid, primary key)
     - user_id (uuid, foreign key to auth.users)
     - os_number (text)
     - status (text)
     - response (jsonb)
     - error_message (text)
     - created_at (timestamp with time zone, default: now())

## Running the Application

1. Start the backend server:
   ```bash
   npm run dev
   ```

2. Start the frontend development server:
   ```bash
   cd frontend
   npm run dev
   ```

3. Open your browser and navigate to `http://localhost:3000`

## Excel File Format

The application expects an Excel file with two sheets:

1. TRANSFER IN
2. TRANSFER OUT

Both sheets should contain the following columns:
- OS
- idServicoReceptivo
- dataInicioServico
- dataFimServico
- (other required fields as per the API specification)

## API Integration

The application will:
1. Read the Excel file
2. Group data by OS number
3. Generate a JSON payload for each OS
4. Send the payload to the external API
5. Log the response in Supabase

## Error Handling

- Failed API calls are logged in the `api_logs` table
- Users are notified of upload and processing status
- Invalid file formats are rejected
- Authentication errors redirect to the login page

## Security

- JWT-based authentication with Supabase
- Protected API endpoints
- Secure file handling
- Environment variable protection 
=======
# xlsx-managetour
>>>>>>> 2bba1488de116986ce5761cd86a8a33a11fcecd2
