module.exports = {
  apps : [
  {
    name        : "expensas",
    script      : "./bin/www",
    cwd		: "/home/hernan/Aplicaciones/expensas",
    watch       : false,
    env:
    {
      "EXPENSAS_MODO":"DEBUG|VERBOSE",
    },
  }]
}
