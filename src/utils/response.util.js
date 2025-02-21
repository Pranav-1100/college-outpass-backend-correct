const sendResponse = (res, status, data = null, message = '') => {
    return res.status(status).json({
      success: status >= 200 && status < 300,
      data,
      message
    });
  };
  
  const sendError = (res, status, error) => {
    const message = error instanceof Error ? error.message : error;
    return res.status(status).json({
      success: false,
      error: message
    });
  };
  
  module.exports = {
    sendResponse,
    sendError
  };