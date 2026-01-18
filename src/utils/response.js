export function success(res, data ={}) {
  return res.json ({
    success: true,
    data,
    error: null,  
  });
}

export function failure (res, statusCode, errorCode) {
  return res.status (statusCode).json ({
    success: false,
    data: null,
    error: {
      code: errorCode,
    },
  });
}