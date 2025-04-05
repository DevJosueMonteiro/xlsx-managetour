require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const axios = require('axios');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Servir arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// Configuration object for location IDs and rows to load
let locationConfig = {
  transferIn: {
    pickup: null,
    dropoff: null
  },
  transferOut: {
    pickup: null,
    dropoff: null
  },
  rowsToLoad: null,
  idHotelPousada: null,
  idEvento: null,
  idGrupo: null,
  idCanalServicoFile: null,
  idCliente: null
};

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(cors());
app.use(express.json());

// Middleware to check authentication
const authenticateUser = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error) throw error;
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Function to get or create unique idPaxIntegrador
async function getUniqueIdPaxIntegrador(userToken) {
  // Create a new Supabase client with the user's token
  const userSupabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${userToken}`
      }
    }
  });

  // Get the last used idPaxIntegrador
  const { data: lastPax, error: lastError } = await userSupabase
    .from('pax_integrador')
    .select('id_pax_integrador')
    .order('id_pax_integrador', { ascending: false })
    .limit(1)
    .single();

  if (lastError && lastError.code !== 'PGRST116') {
    throw lastError;
  }

  // Start from 1 if no records exist, or increment the last one
  const nextId = lastPax ? lastPax.id_pax_integrador + 1 : 1;

  // Insert the new idPaxIntegrador
  const { data: newPax, error: insertError } = await userSupabase
    .from('pax_integrador')
    .insert([{ id_pax_integrador: nextId }])
    .select()
    .single();

  if (insertError) {
    throw insertError;
  }

  return newPax.id_pax_integrador;
}

// Add this function at the top of the file, after the imports
function excelSerialDateToJSDate(serial) {
  // Excel's epoch starts on January 1, 1900
  const utc_days  = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;  
  const date_info = new Date(utc_value * 1000);
  return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate());
}

function formatDate(date) {
  if (!date) return null;
  const d = excelSerialDateToJSDate(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function cleanCPF(cpf) {
  if (!cpf) return '';
  // Remove tudo que não é número e converte para string
  return cpf.toString().replace(/[^\d]/g, '');
}

function calculateAge(birthDateSerial) {
  if (!birthDateSerial) return 0;
  
  const birthDate = excelSerialDateToJSDate(birthDateSerial);
  const today = new Date();
  
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

function formatTime(time) {
  if (!time) return null;

  try {
    // Se for um número (formato Excel - fração do dia)
    if (typeof time === 'number') {
      const totalMinutes = Math.round(time * 24 * 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    // Se o horário já estiver no formato "HH:mm:ss AM/PM", converter para 24h
    if (typeof time === 'string' && (time.includes('AM') || time.includes('PM'))) {
      const [timePart, meridiem] = time.split(' ');
      const [hours, minutes] = timePart.split(':').map(num => parseInt(num));
      
      let hour24 = hours;
      
      if (meridiem === 'PM' && hours < 12) {
        hour24 = hours + 12;
      } else if (meridiem === 'AM' && hours === 12) {
        hour24 = 0;
      }
      
      return `${hour24.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    // Para outros formatos, extrair horas e minutos
    const cleanTime = time.toString().replace(/[^\d:]/g, '');
    let hours, minutes;

    if (cleanTime.includes(':')) {
      [hours, minutes] = cleanTime.split(':').map(num => parseInt(num));
    } else if (cleanTime.length >= 4) {
      hours = parseInt(cleanTime.substring(0, 2));
      minutes = parseInt(cleanTime.substring(2, 4));
    } else {
      return null;
    }

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  } catch (error) {
    console.error('Erro ao formatar hora:', error);
    return null;
  }
}

// Upload and process Excel file
app.post('/api/upload', authenticateUser, upload.single('file'), async (req, res) => {
  try {
    console.log('Configuração atual no momento do upload:', locationConfig);
    console.log('Valores específicos da configuração:', {
      idHotelPousada: locationConfig.idHotelPousada,
      idEvento: locationConfig.idEvento,
      idGrupo: locationConfig.idGrupo,
      idCanalServicoFile: locationConfig.idCanalServicoFile,
      idCliente: locationConfig.idCliente
    });
    console.log('Upload request received');
    if (!req.file) {
      console.log('No file uploaded');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('File received:', req.file.path);
    const workbook = XLSX.readFile(req.file.path);
    console.log('Workbook read successfully');

    const transferInSheet = workbook.Sheets['TRANSFER IN'];
    const transferOutSheet = workbook.Sheets['TRANSFER OUT'];

    if (!transferInSheet || !transferOutSheet) {
      console.log('Required sheets not found');
      return res.status(400).json({ error: 'Required sheets not found' });
    }

    console.log('Processing sheets...');
    const transferInData = XLSX.utils.sheet_to_json(transferInSheet);
    const transferOutData = XLSX.utils.sheet_to_json(transferOutSheet);
    console.log('Sheets processed successfully');

    // Apply row limit if configured
    const limitedTransferInData = locationConfig.rowsToLoad 
      ? transferInData.slice(0, locationConfig.rowsToLoad)
      : transferInData;
    
    const limitedTransferOutData = locationConfig.rowsToLoad
      ? transferOutData.slice(0, locationConfig.rowsToLoad)
      : transferOutData;

    console.log(`Processing ${limitedTransferInData.length} rows from Transfer IN`);
    console.log(`Processing ${limitedTransferOutData.length} rows from Transfer OUT`);

    // Group data by OS
    const osMap = new Map();

    // Process Transfer IN data
    limitedTransferInData.forEach(row => {
      const os = row['OS'];
      if (!osMap.has(os)) {
        osMap.set(os, { transferIn: [], transferOut: [] });
      }
      osMap.get(os).transferIn.push(row);
    });

    // Process Transfer OUT data
    limitedTransferOutData.forEach(row => {
      const os = row['OS'];
      if (!osMap.has(os)) {
        osMap.set(os, { transferIn: [], transferOut: [] });
      }
      osMap.get(os).transferOut.push(row);
    });

    console.log('Data grouped by OS');

    // Convert Map to Array and get unique idPaxIntegrador
    const userToken = req.headers.authorization?.split(' ')[1];
    if (!userToken) {
      throw new Error('No token provided');
    }

    // Create a new Supabase client with the user's token
    const userSupabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${userToken}`
        }
      }
    });

    // Get the last used idPaxIntegrador
    const { data: lastPax, error: lastError } = await userSupabase
      .from('pax_integrador')
      .select('id_pax_integrador')
      .order('id_pax_integrador', { ascending: false })
      .limit(1)
      .single();

    if (lastError && lastError.code !== 'PGRST116') {
      throw lastError;
    }

    // Start from 1 if no records exist, or increment the last one
    let nextId = lastPax ? lastPax.id_pax_integrador + 1 : 1;

    // Process all OSs according to rowsToLoad configuration
    const processedData = Array.from(osMap.entries())
      .filter(([os, data]) => {
        // Process if there's either TRANSFER IN or TRANSFER OUT data
        if ((!data.transferIn || data.transferIn.length === 0) && (!data.transferOut || data.transferOut.length === 0)) {
          console.log(`Skipping OS ${os} - No TRANSFER IN or OUT data found`);
          return false;
        }
        return true;
      })
      .map(async ([os, data]) => {
        // Get the first transfer IN and OUT for basic info
        const firstTransferIn = data.transferIn?.[0];
        const firstTransferOut = data.transferOut?.[0];

        // Use TRANSFER OUT data as fallback if TRANSFER IN is not available
        const baseData = firstTransferIn || firstTransferOut;

        if (!baseData) {
          console.log(`Skipping OS ${os} - No valid data found`);
          return null;
        }

        // Get unique idPaxIntegrador for this OS
        const idPaxIntegrador = nextId++;

        // Log the data being used
        console.log(`Processing OS ${os} with data:`, {
          nomeCompleto: baseData['NOME COMPLETO '],
          cpf: baseData['CPF'],
          dataNascimento: baseData['DATA DE NASCIMENTO'],
          os: baseData['OS'],
          dataInicio: firstTransferIn?.DATA,
          dataFim: firstTransferOut?.DATA,
          idPaxIntegrador: idPaxIntegrador
        });

        // Split name into first name and last name
        const nameParts = baseData['NOME COMPLETO '].trim().split(' ');
        const primeiroNome = nameParts[0];
        const sobrenome = nameParts.slice(1).join(' ');

        // Determine the start and end dates for the services
        const dataInicioServicos = firstTransferIn?.DATA || firstTransferOut?.DATA;
        const dataFimServicos = firstTransferOut?.DATA || firstTransferIn?.DATA;

        // Create the JSON structure according to the template
        const jsonData = {
          Operacao: "C",
          idReservaIntegrador: parseInt(os),
          idCliente: locationConfig.idCliente,
          nomePaxTitular: baseData['NOME COMPLETO '] || "EDUARDO SILVA",
          idHotelPousada: locationConfig.idHotelPousada,
          dataInicioServicos: formatDate(dataInicioServicos),
          dataFimServicos: formatDate(dataFimServicos),
          ADT: baseData.adt || 1,
          CHD: baseData.chd || 0,
          INF: baseData.inf || 0,
          SNR: baseData.snr || 0,
          FREE: 0,
          Mercado: 1,
          Idioma: "POR",
          localizadorCliente: parseInt(os),
          observacoes: baseData.observacoes || "",
          idEvento: locationConfig.idEvento,
          idGrupo: locationConfig.idGrupo,
          fileGrupo: "",
          email: baseData.email || "",
          telefone: baseData.telefone || "",
          cpfPaxTitular: cleanCPF(baseData['CPF']),
          observacoesInternas: "",
          idCanalServicoFile: locationConfig.idCanalServicoFile,
          idEmissor: 7,
          paxsFile: [
            {
              primeiroNome,
              sobrenome,
              cpf: cleanCPF(baseData['CPF']),
              dataNascimento: formatDate(baseData['DATA DE NASCIMENTO']),
              idade: calculateAge(baseData['DATA DE NASCIMENTO']),
              idPaxIntegrador: idPaxIntegrador
            }
          ],
          servicosFile: [
            ...(data.transferIn || []).map(transfer => {
              let voo = transfer.VOO || "";
              if (voo.includes("/")) {
                voo = voo.split("/")[1].trim();
              }

              return {
                idServicoReceptivo: 17,
                dataInicioServico: formatDate(transfer.DATA),
                dataFimServico: formatDate(transfer.DATA),
                aeroporto: transfer.AEROPORTO || "FOR",
                voo: voo,
                horaServicoVoo: formatTime(transfer.CHEGADA),
                idHotelPousada: locationConfig.idHotelPousada,
                idTipoServico: 1,
                idModalidadeServico: 1,
                tipoContratacao: 1,
                idTipoTransporte: null,
                adt: baseData.adt || 1,
                chd: baseData.chd || 0,
                inf: baseData.inf || 0,
                snr: baseData.snr || 0,
                idVendedor: null,
                idReciboInterno: null,
                idFormaPagto: null,
                idTransacaoExterna: 3403,
                observacoes: transfer.observacoes || "",
                idIntermediador: null,
                tarifaADT: "0,00",
                tarifaSNR: "0,00",
                tarifaCHD: "0,00",
                tarifaServico: "0,00",
                idCanalServicoFile: locationConfig.idCanalServicoFile,
                idCupomDesconto: null,
                idLocalPickUp: parseInt(locationConfig.transferIn.pickup),
                idLocalDropOff: parseInt(locationConfig.transferIn.dropoff),
                idTurno: 0,
                tipoNegocio: "B2B",
                paxsServico: [
                  {
                    idPaxIntegrador: idPaxIntegrador.toString(),
                    primeiroNome,
                    sobrenome,
                    idade: calculateAge(baseData['DATA DE NASCIMENTO'])
                  }
                ]
              };
            }),
            ...(data.transferOut || []).map(transfer => {
              let voo = transfer.VOO || "";
              if (voo.includes("/")) {
                voo = voo.split("/")[0].trim();
              }

              return {
                idServicoReceptivo: 18,
                dataInicioServico: formatDate(transfer.DATA),
                dataFimServico: formatDate(transfer.DATA),
                aeroporto: transfer.AEROPORTO || "FOR",
                voo: voo,
                horaServicoVoo: formatTime(transfer.SAÍDA),
                idHotelPousada: locationConfig.idHotelPousada,
                idTipoServico: 1,
                idModalidadeServico: 1,
                tipoContratacao: 1,
                idTipoTransporte: null,
                adt: baseData.adt || 1,
                chd: baseData.chd || 0,
                inf: baseData.inf || 0,
                snr: baseData.snr || 0,
                idVendedor: null,
                idReciboInterno: null,
                idFormaPagto: null,
                idTransacaoExterna: 3403,
                observacoes: transfer.observacoes || "",
                idIntermediador: null,
                tarifaADT: "0,00",
                tarifaSNR: "0,00",
                tarifaCHD: "0,00",
                tarifaServico: "0,00",
                idCanalServicoFile: locationConfig.idCanalServicoFile,
                idCupomDesconto: null,
                idLocalPickUp: parseInt(locationConfig.transferOut.pickup),
                idLocalDropOff: parseInt(locationConfig.transferOut.dropoff),
                idTurno: 0,
                tipoNegocio: "B2B",
                paxsServico: [
                  {
                    idPaxIntegrador: idPaxIntegrador.toString(),
                    primeiroNome,
                    sobrenome,
                    idade: calculateAge(baseData['DATA DE NASCIMENTO'])
                  }
                ]
              };
            })
          ]
        };

        // Insert the new idPaxIntegrador in Supabase using the user's token
        const { error: insertError } = await userSupabase
          .from('pax_integrador')
          .insert([{ id_pax_integrador: idPaxIntegrador }]);

        if (insertError) {
          console.error(`Error inserting idPaxIntegrador for OS ${os}:`, insertError);
          return null;
        }

        return {
          os_number: os,
          data: jsonData,
          idPaxIntegrador: idPaxIntegrador
        };
      });

    // Wait for all promises to resolve
    const resolvedData = await Promise.all(processedData);
    const filteredData = resolvedData.filter(item => item !== null);

    console.log(`Processed ${filteredData.length} OSs successfully`);
    res.json({ 
      data: filteredData,
      skipped: Array.from(osMap.keys()).filter(os => !filteredData.find(p => p.os_number === os))
    });
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({ error: error.message || 'Error processing file' });
  }
});

// New endpoint to send individual OS to API
app.post('/api/send-os', authenticateUser, async (req, res) => {
  try {
    const { os_number, data, idPaxIntegrador } = req.body;
    const userToken = req.headers.authorization?.split(' ')[1];

    // Create a new Supabase client with the user's token
    const userSupabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${userToken}`
        }
      }
    });

    console.log('Recebendo requisição para enviar OS:', os_number);
    console.log('Payload recebido:', data);

    // Prepare Basic Auth credentials
    const auth = Buffer.from(`${process.env.API_USERNAME}:${process.env.API_PASSWORD}`).toString('base64');
    console.log('Using Basic Auth token:', auth);

    // Send to external API
    const apiResponse = await axios.post(
      'https://dev.managetour.app.br/webrun/wsIncluirFile.rule?sys=PGT',
      data,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        validateStatus: function (status) {
          return status >= 200 && status < 500; // Accept any status code less than 500
        }
      }
    );

    console.log('Resposta completa da API:', apiResponse);
    console.log('Dados da resposta da API:', apiResponse.data);

    // Check if the response is an error page
    if (typeof apiResponse.data === 'string' && apiResponse.data.includes('<html>')) {
      throw new Error('API returned an HTML error page');
    }

    // Log success in Supabase using the user's token
    const { error: logError } = await userSupabase
      .from('api_logs')
      .insert({
        user_id: req.user.id,
        os_number,
        id_pax_integrador: idPaxIntegrador,
        status: 'success',
        response: apiResponse.data,
        processed_at: new Date().toISOString()
      });

    if (logError) {
      console.error('Erro ao salvar log:', logError);
      // Don't throw here, just log the error
    }

    res.json({ 
      message: 'OS processada com sucesso',
      status: 'success',
      data: apiResponse.data
    });
  } catch (error) {
    console.error('Erro ao processar OS - Detalhes completos:', error);
    console.error('Resposta da API em caso de erro:', error.response?.data);
    console.error('Status do erro:', error.response?.status);
    console.error('Headers da resposta:', error.response?.headers);

    // Log failure in Supabase using the user's token
    const userToken = req.headers.authorization?.split(' ')[1];
    const userSupabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${userToken}`
        }
      }
    });

    const { error: logError } = await userSupabase
      .from('api_logs')
      .insert({
        user_id: req.user.id,
        os_number: req.body.os_number,
        id_pax_integrador: req.body.idPaxIntegrador,
        status: 'error',
        error_message: error.response?.data || error.message,
        processed_at: new Date().toISOString()
      });

    if (logError) {
      console.error('Erro ao salvar log de erro:', logError);
      // Don't throw here, just log the error
    }

    res.status(500).json({ 
      error: error.response?.data || error.message,
      status: 'error'
    });
  }
});

// Update location configuration
app.post('/api/update-location-config', authenticateUser, async (req, res) => {
  try {
    const {
      transferInPickup,
      transferInDropoff,
      transferOutPickup,
      transferOutDropoff,
      rowsToLoad,
      idHotelPousada,
      idEvento,
      idGrupo,
      idCanalServicoFile,
      idCliente
    } = req.body;

    console.log('Valores recebidos na atualização da configuração:', {
      idHotelPousada,
      idEvento,
      idGrupo,
      idCanalServicoFile,
      idCliente
    });

    // Update the configuration
    locationConfig = {
      transferIn: {
        pickup: transferInPickup,
        dropoff: transferInDropoff
      },
      transferOut: {
        pickup: transferOutPickup,
        dropoff: transferOutDropoff
      },
      rowsToLoad: parseInt(rowsToLoad) || null,
      idHotelPousada: parseInt(idHotelPousada) || null,
      idEvento: parseInt(idEvento) || null,
      idGrupo: parseInt(idGrupo) || null,
      idCanalServicoFile: parseInt(idCanalServicoFile) || null,
      idCliente: idCliente || null
    };

    console.log('Configuração atualizada:', locationConfig);

    res.json(locationConfig);
  } catch (error) {
    console.error('Error updating location config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current location configuration
app.get('/api/location-config', authenticateUser, (req, res) => {
  console.log('Enviando configuração atual:', locationConfig);
  res.json(locationConfig);
});

// New endpoint to get import history
app.get('/api/history', authenticateUser, async (req, res) => {
  try {
    const userToken = req.headers.authorization?.split(' ')[1];
    const userSupabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${userToken}`
        }
      }
    });

    // Fetch only successful logs from Supabase
    const { data: logs, error } = await userSupabase
      .from('api_logs')
      .select('*')
      .eq('status', 'success')
      .order('processed_at', { ascending: false });

    if (error) throw error;

    res.json({ data: logs });
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 