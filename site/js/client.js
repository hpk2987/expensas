$(function() {
	$.get( "/getCuentas", function( data ) {
		data.forEach(function(entry){
			addNavbarButton(entry);
		});
	});

	$("#addCuenta").ajaxForm({
		url: '/addCuenta', 
		dataType: 'json',
		resetForm: true, 
		beforeSubmit:function(formData, jqForm, options){
			if(!formData[0].value){
				return false;
			}
			return true;
		},
		success: function(data,status,xhr,form) {
			addNavbarButton(data);
    	}
	});
});

function addNavbarButton(cuenta){
	var tabtemplate = $("#tab_entry").html();			
	var tabresult = Mustache.render(tabtemplate,cuenta);
	$("#cuentas_tabs").append(tabresult);	
}

function showSelectedCuenta(idCuenta){
	// Paginacion
	var bottomTrigger=20;
	var page=1;
	var pageSize=7;

	// Reconfigurar el scroll para la nueva cuenta	
	$.get( "/countEntradas?idCuenta="+idCuenta, function( data ) {
		var throttled = 
		_.throttle(function(event) {
			if($(window).scrollTop() + $(window).height() > 
						$(document).height() - bottomTrigger) {
				if(page<data.count/pageSize){
	       			addRowsFromPage(idCuenta,page,pageSize);
	       			page++;
	       		}
	   		}
		},20,{trailing:false});
		
		$(window).scroll(throttled);
	});

	//HTML cuenta
	var template = $("#cuenta_template").html();			
	var result = Mustache.render(template,{_id:idCuenta,entradas:[]});

	// Remplazar la vieja cuenta y poner el nuevo esqueleto
	$("#content").html(result);

	// Completar el esqueleto con la primer pagina de entradas
	$.get( 	"/getEntradas?idCuenta="+idCuenta+
					"&offset=0"+
					"&size="+pageSize, function( data ) {
		var cuenta = {_id:idCuenta,entradas:data};

		var template = $("#entradas_rows_template").html();			
		var result = Mustache.render(template,cuenta);
		$("#cuenta_entradas_"+cuenta._id+">tbody>tr:first")
			.after(result);

		cuenta.entradas.forEach(function(entrada){
			ajaxFormOnEntrada(entrada);
		});
	});

	actualizarTotal(idCuenta);

	// Reconfigurar el boton de nueva 	
	$("#cuenta_newEntry"+idCuenta).ajaxForm({
		url: '/addEntrada',
		dataType: 'json',
		resetForm: true,
		beforeSubmit:function(formData, jqForm, options){
			if(!formData[1].value){
				return false;
			}
			if(isNaN(parseFloat(formData[2].value))){
				return false;
			}
			return true;
		},
		success: function(data,status,xhr,form){
			prependRowToTable(data);
		}
	});
}

function addRowsFromPage(idCuenta,page,pageSize){	
	$.get( 	"/getEntradas?idCuenta="+idCuenta+
					"&offset="+page*pageSize+
					"&size="+pageSize, function( data ) {
		var cuenta = {_id:idCuenta,entradas:data};

		var template = $("#entradas_rows_template").html();			
			var result = Mustache.render(template,cuenta);
		$("#cuenta_entradas_"+cuenta._id+">tbody")
			.append(result);

		cuenta.entradas.forEach(function(entrada){
			ajaxFormOnEntrada(entrada);
		});
	});

}

function prependRowToTable(entrada){
	var template = $("#entrada_row_template").html();
  	var result = Mustache.render(template,entrada);

	$("#cuenta_entradas_"+entrada.cuenta+">tbody>tr:first")
		.after(result);

	ajaxFormOnEntrada(entrada);

	actualizarTotal(entrada.cuenta);
}

function removeRowFromTable(cuentaId,entradaId){
	$("#entrada_row_"+entradaId).remove();
	actualizarTotal(cuentaId);
}

function actualizarTotal(cuentaId){
	$.get( "/getTotalCuenta?id="+cuentaId, function( data ) {
		$("#cuenta_total_"+cuentaId)
			.html(data.total);
	});
}

function ajaxFormOnEntrada(entrada){
	$("#entrada_delete"+entrada._id).ajaxForm({
		url: '/removeEntrada',
		dataType: 'json',
		resetForm: true,
		success: function(data,status,xhr,form){
			removeRowFromTable(entrada.cuenta,data.id);
			
			$("#cuenta_newEntry_"+entrada._id+">input[name='desc']")
				.focus();
		}
	});
}
