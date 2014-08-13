$(function() {
	$.get( "/getCuentas", function( data ) {
		data.forEach(function(entry){
			addCuentaDiv(entry);
		});
	});

	$("#addCuenta").ajaxForm({
		url: '/addCuenta', 
		dataType: 'json',
		success: function(data,status,xhr,form) {
			addCuentaDiv(data);
    	}
	});
});

function addCuentaDiv(cuenta){
	$.get( "/getEntradas?idCuenta="+cuenta._id, function( data ) {
		cuenta.entradas = data;
		cuenta.getTotal = function(){
			var total = 0;
			for(var c=0; c<cuenta.entradas.length; c++){
				total += parseInt(cuenta.entradas[c].monto);
			}
			return total;
		};

		var template = $("#cuenta_template").html();			
	  	var result = Mustache.render(template,cuenta);

		$("#cuentas").append(result);

		$("#cuenta_delete"+cuenta._id).ajaxForm({
			url: '/removeCuenta',
			dataType: 'html',
			success: function(data,status,xhr,form){
				$("#cuenta_"+cuenta._id).remove();
			}
		});

		$("#cuenta_newEntry"+cuenta._id).ajaxForm({
			url: '/addEntrada',
			dataType: 'json',
			success: function(data,status,xhr,form){
				appendRowToTable(data);
			}
		});

		cuenta.entradas.forEach(function(entrada){
			ajaxFormOnEntrada(entrada);
		});
	});
}

function appendRowToTable(entrada){
	var template = $("#entrada_row_template").html();
  	var result = Mustache.render(template,entrada);

	$("#cuenta_entradas_"+entrada.cuenta+">tbody:last")
		.append(result);

	ajaxFormOnEntrada(entrada);
}

function ajaxFormOnEntrada(entrada){
	$("#entrada_delete"+entrada._id).ajaxForm({
		url: '/removeEntrada',
		dataType: 'json',
		success: function(data,status,xhr,form){
			removeRowFromTable(data.id);
		}
	});
}

function removeRowFromTable(entradaId){
	$("#entrada_row_"+entradaId).remove();
}