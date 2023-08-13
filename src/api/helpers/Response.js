class Response {
  static authSuccess(res, status, token, message) {
    return res.status(status).json({
      status,
      message,
      token,
    });
  }

  static success(res, status, data, message) {
    return res.status(status).json({
      status,
      message,
      data,
    });
  }

  static handleError(res, status, error) {
    return res.status(status).json({
      status,
      error,
    });
  }

  static send(res, status, data, message) {
    return res.status(status).json({
      status,
      message,
      data,
    });
  }
}

module.exports = Response;